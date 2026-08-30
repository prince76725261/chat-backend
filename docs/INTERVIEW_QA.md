# Interview Q&A — SDE-2

Questions an SDE-2 interviewer is likely to ask about this project, with answers
grounded in the actual code. The pattern that scores well is always the same:
**state the decision, give the reason, name the trade-off you accepted.**

---

## Contents

- [A. Opening the conversation](#a-opening-the-conversation)
- [B. System design](#b-system-design)
- [C. Database & data modelling](#c-database--data-modelling)
- [D. Realtime & WebSockets](#d-realtime--websockets)
- [E. Authentication & security](#e-authentication--security)
- [F. Concurrency & correctness](#f-concurrency--correctness)
- [G. Frontend engineering](#g-frontend-engineering)
- [H. Scaling & operations](#h-scaling--operations)
- [I. Debugging & testing](#i-debugging--testing)
- [J. Deployment & DevOps](#j-deployment--devops)
- [K. JavaScript, Node & React fundamentals](#k-javascript-node--react-fundamentals)
- [L. Behavioural & judgement](#l-behavioural--judgement)
- [M. Questions to ask them](#m-questions-to-ask-them)

---

## A. Opening the conversation

### 1. Walk me through your project in two minutes.

> It is a real-time chat application in the shape of WhatsApp. React and Vite on
> the front, Express with Socket.IO on the back, MongoDB for storage.
>
> Three things are worth pulling out. **First, the friend graph** — you cannot
> message someone until you are friends, which means every chat action has an
> authorisation check behind it, not just an authentication check. **Second, the
> realtime layer** — REST for reads and writes because I want a response I can
> act on, WebSockets purely for pushing to other people, with the socket treated
> as a best-effort notification channel so a dropped connection is never a
> correctness problem. **Third, the parts that had to be right under
> concurrency** — a normalised pair key makes duplicate chats and duplicate
> friend requests impossible at the database level, and an idempotency key makes
> a retried send return the original message instead of a duplicate.
>
> The main gap versus real WhatsApp is end-to-end encryption, which I left out
> deliberately — it changes the architecture completely.

**Why this works:** it is structured, it names concrete engineering decisions
rather than listing features, and it volunteers a limitation. Interviewers read
that last part as maturity.

### 2. What was the hardest part?

> Getting message state right when the same user has several devices. My first
> version emitted into a room per *chat*, which meant if you had the chat closed
> you never learned there was a new message — the sidebar and the unread badge
> silently went stale. I changed it so every socket joins a room named after its
> **user id**, and the server emits per participant. Now every device a person
> has connected gets the event regardless of what is on screen, and the same
> room doubles as the address for presence and friend-request events.

### 3. What would you do differently if you started over?

> Two things. I would write the integration tests as I went — I verified the
> flows manually and with a scripted browser run, which caught real bugs but
> does not protect me from regressions. And I would put Redis in from the start
> rather than an in-process `Map` for presence, because that `Map` is the single
> thing standing between this and running more than one instance, and retrofitting
> it touches the socket layer, the presence logic and the deployment.

---

## B. System design

### 4. Why REST for sending a message instead of the WebSocket?

> Because sending is a write that needs a response the client acts on — the
> persisted `_id`, the server `createdAt`, the populated sender. Over a socket I
> would have to build request/response correlation, timeouts, retries and error
> codes, all of which HTTP already gives me.
>
> The division I settled on is: **HTTP for anything where the caller needs an
> answer, WebSocket for pushing to people who did not ask.** The socket is a
> notification channel, not the source of truth.

**Likely follow-up — "Isn't that slower?"**

> Marginally, and it does not matter. The recipient's latency is what a user
> perceives, and that path is a socket emit either way. The sender already sees
> their message instantly because the UI renders optimistically before the
> request resolves.

### 5. What happens if the WebSocket drops mid-conversation?

> Socket.IO reconnects with backoff, and re-authenticates because I re-read the
> current access token on `reconnect_attempt` — the old one may have expired
> during the outage.
>
> The important part is that nothing is lost. Messages live in MongoDB, not in
> socket state, so on reconnect the client refetches the chat list and the open
> conversation and converges. That is the whole reason I made the socket
> best-effort: it means a flaky network degrades the experience without ever
> corrupting it.

**Follow-up — "How would you guarantee no missed messages?"**

> Track the last received message id per chat on the client, and on reconnect
> fetch everything after it. The endpoint already supports it — the cursor
> pagination is the same mechanism pointed forwards instead of backwards.

### 6. Design the same system for 10 million users. What changes?

> Almost everything about *deployment*, not much about the data model.
>
> **Stateless app tier.** The socket registry moves to Redis and Socket.IO gets
> the Redis adapter, so any instance can push to a user connected to any other.
> Then I can put N instances behind a load balancer.
>
> **Storage.** Shard `messages` on `chat`, so one conversation's history lives on
> one shard and pagination stays a single-shard query. The cost is a hot shard
> for a very busy chat, which is the accepted trade.
>
> **Fan-out.** Per-participant emit is linear in group size. At 10k-member
> groups you move to room broadcast plus a separate lightweight badge path, and
> embedded read receipts stop working — they become a per-user "last read
> message" pointer instead of an array.
>
> **Write path.** Put a queue between the API and the fan-out so a message is
> acknowledged as soon as it is durable, and delivery happens asynchronously.
>
> Honestly though — at 10 million users the interesting problems are operational.
> I would want metrics and tracing in place before I touched any of this.

### 7. Why MongoDB and not PostgreSQL?

> Messages are self-contained documents with a variable shape — optional
> `replyTo`, arrays of receipts, a soft-delete list — and the dominant query is
> "the last N messages in this conversation", which one compound index answers
> perfectly. There are no multi-entity transactions in the hot path.
>
> But I would push back on the premise a little: `friendships` is a relational
> table wearing a document costume. It is a join table with a status column. If
> the product grew relational features — mutual friends, friend-of-friend
> suggestions, analytics — Postgres would become the better answer, and `jsonb`
> would cover the flexible parts.

**Follow-up — "So did you pick wrong?"**

> No, but I would not defend it as the only right answer. For the access
> patterns this app actually has, Mongo fits and the indexes do the work. I
> would revisit it the moment the friend graph needed to be queried as a graph.

---

## C. Database & data modelling

### 8. Why are messages a separate collection instead of an array in the chat?

> Two reasons, one hard and one about write cost.
>
> The hard limit: a MongoDB document caps at 16 MB. An active conversation blows
> past that, and then the app simply stops working — a ceiling I cannot raise.
>
> The write cost: appending to an embedded array rewrites a growing document
> every time, so writes get slower as the conversation gets longer.
>
> As a separate collection with `{chat: 1, createdAt: -1}`, any page of any
> conversation is an indexed lookup regardless of history size.

### 9. Explain your message index. Why that field order?

> `{chat: 1, createdAt: -1, _id: -1}`.
>
> `chat` first because it is an **equality** match — it narrows the scan to one
> conversation immediately. Then `createdAt: -1`, which matters more than people
> expect: because the index is already in the sort order, MongoDB walks it and
> stops after the page size. **The sort is served by the index**, so there is no
> in-memory sort and no 32 MB sort-memory limit to hit.
>
> `_id: -1` is a tiebreaker. Two messages can share a millisecond, and without
> it their relative order could vary between reads, which shows up as messages
> visually swapping when you scroll. ObjectIds embed a counter, so they break the
> tie deterministically.

**Follow-up — "What if you put `createdAt` first?"**

> It would be much worse. Range-first means scanning every chat's messages in
> that time window and filtering. The general rule for compound indexes is
> **equality, then sort, then range** — ESR.

### 10. What is `pairKey` and why does it exist?

> It is `[idA, idB].sort().join("_")` — an order-independent identity for a pair
> of users, so `A_B` and `B_A` normalise to the same string.
>
> I use it in two places, both to turn an application rule into a database
> invariant. On `chats`, a unique index means two users can only ever have one
> 1:1 conversation. On `friendships`, it means one relationship row per pair.
>
> Without it, the classic bug is both people tapping "message" at the same
> instant: two `find`s both return nothing, both `create`s succeed, and now
> there are two conversations with half the history in each. A uniqueness
> constraint is the only way to close that race — application-level checking is
> a read-then-write, which is racy by construction.

### 11. Your unique indexes are partial. Why?

> Because `pairKey` is `null` for group chats, and a plain unique index treats
> `null` as a value. The *second* group chat ever created would collide with the
> first.
>
> `partialFilterExpression: { pairKey: { $type: "string" } }` applies uniqueness
> only to documents that actually have a pair key, so group chats are exempt.
> Same reasoning for the `clientId` index — messages without one are unconstrained.

### 12. You store `friends` on the user *and* a `friendships` collection. Isn't that redundant?

> It is, deliberately. It is a read optimisation with an explicit consistency
> obligation.
>
> The friend list is read constantly — every DM permission check, every group
> creation, the friends tab. It changes only when someone accepts or removes a
> friend, which is orders of magnitude rarer. Denormalising it turns the hot
> read into one indexed lookup with no join.
>
> `friendships` stays the source of truth for *state* — who asked whom, when,
> pending versus accepted. `User.friends` is a materialised view of the accepted
> subset.

**Follow-up — "How do you keep them consistent?"**

> The accept path writes three documents that must not half-apply, so it runs in
> a transaction where the deployment supports one. Standalone `mongod` has no
> transactions, so there is a fallback to sequential writes — and because the
> updates are `$addToSet`, they are idempotent, so a retry after a partial
> failure converges rather than duplicating.
>
> If I wanted to be stricter I would add a periodic reconciliation job that
> rebuilds `User.friends` from `friendships`, which is the standard safety net
> for any materialised view.

### 13. Where does this data model break down?

> Read receipts. `readBy` is an array embedded in each message. In a 1:1 chat
> that is two entries; in a 10-person group, ten. In a 500-person group it
> becomes the dominant cost of every message document, and marking a chat read
> means pushing into hundreds of arrays.
>
> The fix is to stop storing per-message receipts and store a per-user
> `lastReadMessageId` on the chat membership instead. Then "read" is a
> comparison rather than an array membership test, and the cost stops scaling
> with group size. I did not do it here because it makes per-message ticks
> harder, and for small groups the array is genuinely simpler.

---

## D. Realtime & WebSockets

### 14. Walk me through what happens when a user sends a message.

> 1. The client renders the bubble immediately with a generated `clientId` —
>    optimistic UI, so the sender never waits on the network.
> 2. `POST /api/messages`. The server checks the caller is a participant, then
>    inserts the message, stamping `deliveredTo` for every participant who
>    currently has a live socket.
> 3. It updates `chat.latestMessage` so the sidebar preview and its ordering
>    stay correct.
> 4. It emits `message:new` into **each participant's personal room**.
> 5. The client swaps the optimistic bubble for the server's copy, which now has
>    a real id and timestamp.
>
> Two failure paths matter. If the POST fails, the bubble is marked failed —
> nothing is lost server-side. If it is retried, the unique `{chat, clientId}`
> index rejects the duplicate insert and the controller returns the original
> message.

### 15. Why emit to a room per user rather than per chat?

> Because a chat room only reaches people who currently have that conversation
> open. If your chat list is on screen and someone messages you, a chat-room
> emit never arrives, so the preview and unread badge go stale until you refresh.
>
> A personal room — every socket joins a room named after its user id — reaches
> every device that person has connected, whatever is on screen. It also gives
> me one address for presence, friend requests and chat updates. I still use
> chat rooms, but only for typing indicators, where "people currently looking at
> this conversation" is exactly the right audience.

### 16. How do you handle a user with multiple devices?

> Presence is a `Map` of `userId → Set<socketId>`, so one user with a laptop and
> a phone is one online user with two sockets. Online means "the set is
> non-empty".
>
> The subtle part is going offline. Naively, any disconnect marks you offline —
> so closing one of three tabs makes you appear offline while you are still
> using the app. I only flip to offline and stamp `lastSeen` when the set becomes
> **empty**, i.e. the last device disconnects.

### 17. How is the socket authenticated?

> In the handshake, via `io.use()`. The client passes the access token in
> `handshake.auth`, the middleware verifies it and attaches the user to the
> socket. An unauthenticated socket never gets created, so no event handler has
> to re-check identity — that is one whole class of bug removed.
>
> It has to be `handshake.auth` rather than a header because the browser
> WebSocket API does not allow custom headers on the upgrade request.

**Follow-up — "What if the token expires while connected?"**

> The connection stays up, because Socket.IO only authenticates at the
> handshake. That is an accepted gap: the blast radius is one session that
> outlives its token until the socket drops.
>
> The tightening, if it mattered, is a periodic re-auth event where the server
> asks the client for a fresh token and disconnects it if it cannot produce one.
> On reconnect it is already handled — the client re-reads the current token, so
> it never loops on an expired one.

### 18. Why debounce typing indicators?

> Emitting per keystroke sends dozens of events per sentence, and every one is
> broadcast to everyone in the chat — pure waste for information that only needs
> to be roughly right.
>
> I emit `typing` once on the first keystroke, then a debounced `typing:stop`
> 1.5 seconds after the last one. So a sentence is two events instead of forty.
>
> The bug I hit: if you switch chats while the flag is latched, the other side's
> indicator never clears. So the cleanup releases it on unmount and on chat
> switch, not just on send.

---

## E. Authentication & security

### 19. Why two tokens instead of one?

> Because the two single-token designs each have a bad failure mode.
>
> A JWT in `localStorage` is readable by any script, so one XSS exfiltrates a
> long-lived credential. A long-lived session cookie is safe from XSS but exposed
> to CSRF, and does not fit a WebSocket handshake cleanly.
>
> Splitting narrows both. The **access token** lives in a JS variable — 15
> minutes, gone on reload, so the XSS window is small. The **refresh token** is
> an httpOnly cookie scoped to `path=/api/auth` — script cannot read it at all,
> and it is not even sent to normal API routes.

**Follow-up — "You still have a token in JS. Isn't that XSS-vulnerable?"**

> Yes, and I would not claim otherwise. If an attacker runs script in my page
> they can make authenticated requests as the user for up to 15 minutes.
>
> The point is defence in depth: they cannot steal a durable credential, so they
> lose access when the tab closes. The actual fix for XSS is not token storage —
> it is not having XSS. React escapes by default and I never use
> `dangerouslySetInnerHTML`, and a strict CSP would be the next layer.

### 20. Why is refresh single-flight?

> Because a page load fires several requests at once. If the access token has
> expired, they all 401 together, and each interceptor would independently call
> `/refresh`. With rotation, each refresh invalidates the previous one, so they
> race and most fail — the user gets logged out for no reason.
>
> Caching the in-flight promise means all of them await one call:
> `refreshing = refreshing || api.post("/auth/refresh")`. One network request,
> everyone retries with the same new token.

### 21. Why is the login error message identical for a wrong password and an unknown user?

> To avoid a user-enumeration oracle. If "no such user" and "wrong password"
> differ, the login form becomes a way to test whether an email is registered —
> useful for targeted phishing and for credential stuffing, because an attacker
> can narrow a leaked list to accounts that actually exist here.
>
> Both return `Invalid credentials`. Combined with the rate limit — 20 attempts
> per 15 minutes — probing gets expensive.

**Follow-up — "Any timing leak?"**

> Yes, in principle. Unknown user returns fast; a real user pays for a bcrypt
> comparison. A patient attacker could distinguish them. The mitigation is to
> hash against a dummy value when the user does not exist, so both paths do the
> same work. I did not implement it, and I would flag it as a known gap rather
> than claim the endpoint is fully constant-time.

### 22. How do you prevent NoSQL injection?

> Every request body goes through a Zod schema before it reaches a controller,
> and the controller uses the **parsed** result, not the raw body. So if someone
> posts `{"identifier": {"$ne": null}}`, the schema demands a string and rejects
> the object outright.
>
> That is the general defence: validate and coerce at the boundary, so operator
> objects can never reach a query. I also escape user input before building a
> `RegExp` for search — otherwise a crafted pattern is a ReDoS.

### 23. How do you stop a user reading someone else's conversation?

> Every chat and message handler verifies **participation**, not just a valid
> token. `loadChatAsMember` fetches the chat and checks the caller's id is in
> `users`, and throws 403 otherwise.
>
> That is the distinction between authentication and authorisation, and it is
> where IDOR bugs come from — a valid token proves who you are, not what you may
> read. Same pattern for group admin actions and for accepting a friend request,
> where only the recipient may accept. I verified each of those with an explicit
> negative test.

---

## F. Concurrency & correctness

### 24. Two users tap "message" at the same instant. What stops two chats being created?

> A unique index on `pairKey`, and an upsert instead of check-then-create.
>
> The naive version is `findOne`, and if nothing comes back, `create`. Both
> requests find nothing, both create, and now there are two conversations with
> the history split between them.
>
> `findOneAndUpdate` with `upsert: true` pushes the decision into MongoDB, where
> it is atomic on the indexed key. One wins, the other's upsert matches the
> now-existing document and returns it. Both users end up in the same chat.

### 25. What if the network drops after the server saves a message but before the client sees the response?

> The client retries, and idempotency handles it. Each send carries a
> `clientId`, and there is a unique index on `{chat, clientId}`. The retry's
> insert fails with duplicate key 11000, which the controller catches and
> answers by returning the original message.
>
> The reason it is an index rather than a "does this clientId exist?" check is
> that the check is itself a read-then-write race — two retries in flight
> together would both read "no" and both insert. The database constraint cannot
> be raced.

### 26. Talk me through the friendship accept transaction.

> Accepting writes three documents: the friendship status, and each user's
> `friends` array. Half-applying is a real bug — one person sees a friend, the
> other does not, and the UI disagrees about whether they can chat.
>
> So it runs in `session.withTransaction`. But transactions need a replica set,
> and a plain local `mongod` is standalone, so I catch that and fall back to
> sequential writes. That fallback is only acceptable because the updates are
> `$addToSet`, which is idempotent — re-running after a partial failure converges
> instead of duplicating.
>
> It is a deliberate trade: strict correctness where the deployment supports it,
> eventual convergence where it does not.

### 27. What if a user is deleted while they have a chat open?

> `protect` looks the user up on every request, so the next call returns 401
> "User no longer exists" and the client logs out. The socket would stay
> connected until it drops, which is the same gap as an expired token, fixed the
> same way — a server-initiated disconnect on account deletion.
>
> Their messages remain, with a `sender` reference pointing at nothing.
> `populate` yields null and the UI would need to render "Deleted user". That is
> a real hole I have not closed — the options are soft-deleting users, or a
> cleanup job. I would pick soft delete, because hard-deleting a user in a chat
> app damages other people's conversation history.

---

## G. Frontend engineering

### 28. Why Context instead of Redux?

> Three providers with clean boundaries — auth, socket, chat — cover the whole
> app. Redux's real value is time-travel debugging and middleware for complex
> async graphs, and neither pays for its boilerplate at this size.
>
> The cost I did accept: any Context value change re-renders every consumer.
> That is why the socket handlers read `activeChat` through a **ref** rather than
> a dependency — otherwise every chat switch would tear down and re-subscribe
> every socket listener, which drops events during the gap.
>
> Past this size I would reach for Zustand before Redux — selector-based
> subscriptions solve the re-render problem without the ceremony.

### 29. Explain your optimistic UI, including how it can go wrong.

> On send, the message is pushed into state immediately with a temporary
> `clientId` and a `pending` flag that renders a clock icon. When the server
> responds, the temporary entry is replaced by the real one. If it fails, the
> bubble is marked failed rather than silently disappearing.
>
> The bug worth knowing about is **double rendering**. The sender is a
> participant, so they also receive the `message:new` broadcast for their own
> message — the optimistic copy and the pushed copy would both render. So the
> handler dedupes on both `_id` and `clientId` before appending.

### 30. How does infinite scroll work without the view jumping?

> Prepending older messages increases `scrollHeight` above the viewport, so the
> browser keeps `scrollTop` and the content the user was reading jumps away.
>
> I record `scrollHeight` before the fetch, and after the DOM updates set
> `scrollTop = newHeight - oldHeight`. That restores the exact reading position.
>
> There is a second, related rule: auto-scroll to the bottom on a new message
> **only if the user is already near the bottom**. Otherwise reading history gets
> interrupted every time someone types.

### 31. Why cursor pagination rather than page numbers?

> Two reasons, and the second is the one people miss.
>
> `skip(n)` makes the server walk and discard n documents, so page 500 of a long
> conversation is dramatically slower than page 1 — and scrolling far back is
> exactly what users do in chat.
>
> The correctness reason: `skip` is **wrong under concurrent writes**. If three
> messages arrive while you are reading, every offset shifts, so the next page
> repeats rows you already saw. A `createdAt` cursor is anchored to a fixed
> point and is unaffected.
>
> I also fetch `limit + 1` rows — the extra row tells me whether more exist
> without a separate `count`.

---

## H. Scaling & operations

### 32. Your presence map is in-process. What breaks with two instances?

> Roughly half the messages stop being delivered.
>
> User A connects to instance 1, user B to instance 2. When A sends a message,
> instance 1 looks up B in its local `Map`, finds nothing, and pushes nothing.
> B's message never arrives until they refresh. Presence is equally wrong — each
> instance only knows about its own sockets.
>
> The fix is two parts. `@socket.io/redis-adapter` so an emit on one instance
> fans out to all of them via pub/sub. And presence into Redis — a set per user
> with a TTL heartbeat, so if an instance crashes, its sockets expire instead of
> leaking as permanently online. That TTL detail matters; without it a crash
> leaves ghosts forever.

### 33. How would you monitor this in production?

> The things I would actually page on: **end-to-end message latency p99** —
> accepted to delivered, because that is what users feel; **socket count and
> churn**, since a reconnect storm is the classic symptom of an unhealthy
> instance; **DB pool saturation**, which is what precedes a cascade; and **error
> rate by endpoint**.
>
> Underneath that, structured JSON logs with a request id threaded through, so
> one user's report can be traced end to end, and readiness probes that check
> Mongo — not just liveness, or the load balancer sends traffic to an instance
> that cannot serve it.

### 34. How would you deploy it?

> Frontend to a CDN as static assets — it is a Vite build, no server needed.
> Backend as a container behind a load balancer with **WebSocket support and a
> long idle timeout**, which is the thing people get wrong; a 60-second idle
> timeout silently kills chat connections. MongoDB Atlas, with the app's egress
> IPs allow-listed.
>
> Secrets from the platform's secret manager, never a committed `.env`. And I
> would need sticky sessions if HTTP long-polling fallback is enabled, because
> polling requires consecutive requests to reach the same instance.

---

## I. Debugging & testing

### 35. A user says messages sometimes arrive twice. How do you debug it?

> First, reproduce and narrow: is it two documents in the database, or one
> document rendered twice? That splits the problem cleanly in half, and I would
> check Mongo directly before touching the client.
>
> If it is two documents, the send is being retried without a `clientId`, or the
> idempotency index is missing in that environment — worth confirming
> `getIndexes()` on the deployed database, because indexes defined in code are
> only built if the collection was created through the app.
>
> If it is one document rendered twice, it is the client dedupe. The likely cause
> is the sender receiving their own broadcast and the optimistic entry not being
> matched — which is exactly why the handler checks both `_id` and `clientId`.
>
> I would also check for a duplicated socket listener, which is what happens when
> a `useEffect` subscribes without cleaning up and re-runs.

### 36. How would you test this?

> Three layers, and I would be honest that the project currently has none of them
> automated.
>
> **Unit** — pure logic: the pair key, formatters, the tick-state derivation.
> **Integration** — Supertest against an in-memory MongoDB, which is where the
> value is concentrated: the friend request lifecycle including the negative
> cases, that a non-friend gets 403 on a DM, that a non-participant gets 403 on
> history, that a duplicate `clientId` returns the original message, and that
> cursor pages do not overlap.
> **End-to-end** — Playwright with two browser contexts, which is the only way to
> test realtime properly: log in as two users, send from one, assert it appears
> in the other without a reload.
>
> I verified all of those manually and with a scripted browser run while
> building. The gap is that none of it protects me from regressions.

### 37. What is the first bug you would expect a new developer to hit here?

> Forgetting that the socket handlers close over stale state. If you subscribe in
> a `useEffect` with `activeChat` in the dependency array, you re-subscribe on
> every chat switch and lose events in the gap. If you leave it out, the handler
> reads a stale `activeChat` forever. The ref pattern is the resolution, and it
> is not obvious until it bites.

---

## J. Deployment & DevOps

### 41. Where is this deployed, and why is it split across two providers?

> The React app is on **Vercel** as static files on a CDN. The API is on a host
> that keeps a long-lived Node process — Render, Railway or Fly.
>
> The split is forced, not a preference. Vercel runs **serverless functions**:
> a process starts to serve a request and is torn down afterwards. Two things in
> this API are incompatible with that. A WebSocket has to stay open for the whole
> session, and a function that lives for one request cannot hold one. And the
> presence registry is an in-process `Map` of `userId → Set<socketId>` — serverless
> invocations do not share memory, so it would be empty every time.
>
> Vercel is genuinely the right tool for the frontend, though: it is a static
> bundle, and a CDN is exactly what that wants.

**Follow-up — "Could you make it Vercel-only?"**

> Two honest ways. Drop realtime and poll the REST API on a timer — simple, but
> it throws away the entire point of the architecture. Or replace Socket.IO with
> a hosted realtime service like Pusher or Ably, which holds the connections
> outside my infrastructure; then the serverless function just publishes to it.
>
> That second one is a real design, not a hack. The trade is a third-party
> dependency and cost per message in exchange for not operating a stateful tier.

### 42. What actually breaks when the frontend and API are on different domains?

> The refresh cookie becomes a **third-party cookie**, and three things all have
> to be true or login silently stops persisting:
>
> - the cookie needs `SameSite=None; Secure`, which also means **both** sides must
>   be HTTPS — `Secure` cookies are dropped over plain HTTP;
> - `credentials: true` on the CORS config *and* `withCredentials` on axios;
> - an explicit origin allow-list, because `credentials: true` makes a wildcard
>   `Access-Control-Allow-Origin: *` illegal.
>
> The failure mode is nasty because login *appears* to work — you get a token and
> land on the chat screen — and then a refresh logs you out, because the cookie
> was never stored.
>
> Even with all of that right, Safari and Brave block third-party cookies by
> default. The real fix is to put both on the same site — `app.example.com` and
> `api.example.com` sharing `Domain=.example.com` — which is what I would do for
> anything beyond a demo.

### 43. What environment-specific bugs have you hit?

> Three worth naming, because they are the ones that cost time.
>
> **`VITE_*` variables are compiled in at build time**, not read at runtime.
> Setting `VITE_API_URL` in the dashboard after deploying does nothing until you
> rebuild. People lose an hour to this.
>
> **`trust proxy`.** Behind a load balancer, Express sees the proxy's IP, so
> rate limiting buckets every user together and secure cookies misbehave.
> `app.set("trust proxy", 1)` fixes it.
>
> **Deployment protection.** Vercel put SSO in front of the deployment by
> default, so every URL 302'd to a login page. Fine for a private preview,
> wrong for a portfolio link.

### 44. How would you set up CI/CD for this?

> On every pull request: install, lint, run unit and integration tests against an
> in-memory MongoDB, and build both workspaces. Merging to `main` deploys the
> API first, then the frontend — that order matters, because a frontend calling
> an endpoint the API does not have yet is a broken deploy, whereas an API with
> an endpoint nothing calls yet is harmless.
>
> I would gate on the health check after the API deploy and roll back if it
> fails. And I would want the database migration story settled before any of
> this: Mongoose has no migration framework, so schema changes are the risky
> part, not the code.

**Follow-up — "How do you do a breaking schema change with zero downtime?"**

> Expand and contract. Add the new field and write to both old and new. Backfill
> existing documents with a job. Switch reads to the new field once the backfill
> is verified. Only then stop writing the old one and drop it. Each step is
> independently deployable and reversible — which is the whole point.

### 45. Your free-tier API sleeps after 15 minutes. Is that a problem?

> For a portfolio demo, no — but I would say it out loud before someone clicks
> the link and thinks the app is broken. The first request after idle takes
> 30–60 seconds to cold start.
>
> If it mattered, the options in increasing order of cost are: a cron ping to
> keep it warm, which is a bit dishonest and burns the free tier anyway; a paid
> always-on instance; or moving to a platform with faster cold starts. For real
> traffic the question is moot, because the service never goes idle.

---

## K. JavaScript, Node & React fundamentals

Interviewers usually pair project questions with language questions, often
anchored to code you wrote. These are the ones this project naturally invites.

### 46. Node is single-threaded. How does it serve many concurrent chat users?

> The **event loop**. Node runs my JavaScript on one thread, but I/O — database
> queries, socket writes, filesystem — is handed to the OS or to libuv's thread
> pool and continues in the background. While a Mongo query is in flight the
> thread is free to run other requests.
>
> That is why Node suits this workload: a chat server is almost entirely I/O
> wait, with very little computation. A thousand idle WebSockets cost almost
> nothing, because none of them are executing anything.
>
> The flip side is that any CPU-bound work blocks *everyone*. Which is exactly
> what `bcrypt` is — deliberately slow, deliberately CPU-heavy.

**Follow-up — "So doesn't bcrypt block your server?"**

> `bcryptjs` in async mode yields between rounds rather than occupying the thread
> in one block, so it does not fully stall the loop. But it is still real CPU
> work on the main thread.
>
> The stronger answer is native `bcrypt`, which runs on libuv's thread pool and
> genuinely leaves the main thread free. Under real load I would switch to it,
> and I would keep the cost factor deliberate — the rate limiter on `/login` is
> what stops that CPU cost being an easy denial-of-service.

### 47. What is the difference between `deliveredTo.push` and `$addToSet` in my code, and why does it matter?

> `$push` always appends; `$addToSet` appends only if an equal element is not
> already present — so it is **idempotent**.
>
> That distinction carries real weight in the friendship accept path. Because
> the transaction can fall back to sequential writes on a standalone MongoDB, a
> retry after a partial failure must not corrupt anything. `$addToSet` means
> re-running converges to the same state instead of adding a duplicate friend.
>
> There is a subtlety though: `$addToSet` compares whole documents, so for
> `readBy: [{user, at}]` two entries with the same user but different timestamps
> are *not* equal and both would be added. That is why the "already read" guard
> lives in the query filter, not in the update operator.

### 48. Explain the `useEffect` cleanup in your socket code and what breaks without it.

> Every `socket.on` in the effect has a matching `socket.off` in the returned
> cleanup. Without it, each re-run adds another listener without removing the
> old one — so after five chat switches, one incoming message fires five
> handlers and the message renders five times.
>
> The same applies to the typing indicator: the cleanup emits `typing:stop`, so
> switching chats mid-sentence does not strand a permanent "typing…" on the
> other person's screen.
>
> React 18 StrictMode makes this visible in development by intentionally
> mounting, unmounting and remounting every component — which surfaces exactly
> these leaks instead of letting them reach production.

### 49. Why does your code use a ref for `activeChat` instead of a dependency?

> Because the socket handlers need the *current* value without being torn down
> and rebuilt when it changes.
>
> Put `activeChat` in the dependency array and every chat switch unsubscribes and
> resubscribes every listener — and events arriving in that window are lost. Leave
> it out and the handler closes over a stale value forever, so it never matches
> the chat you are actually looking at.
>
> A ref resolves the tension: `activeRef.current` is mutable and always current,
> and mutating it does not trigger a re-render or re-run the effect. It is the
> standard escape hatch for "I need the latest value inside a long-lived
> callback".

### 50. What is the difference between `==` and `===`, and where did it bite you here?

> `===` compares without type coercion; `==` coerces first.
>
> The place it matters in this codebase is not primitives — it is that Mongo
> `ObjectId` is an **object**, so `id1 === id2` is false even for the same id,
> because they are different object instances. Neither operator does what you
> want.
>
> That is why comparisons are consistently `String(a) === String(b)`. Every
> participation check, every "is this my message" check. Getting it wrong fails
> *open* in the worst cases — a permission check that always returns false, or a
> `mine` check that renders every bubble on the wrong side.

### 51. How does JWT verification actually work? Is a JWT encrypted?

> **No — a JWT is signed, not encrypted.** Anyone can base64-decode it and read
> the payload. That is why it holds only a user id and username, never anything
> sensitive.
>
> Verification recomputes the HMAC of header and payload with the server's secret
> and compares it to the signature. If they match, the token has not been
> tampered with — you cannot change the `sub` to another user's id without
> invalidating the signature. `jsonwebtoken` also checks `exp`, which is what
> raises `TokenExpiredError`, and I distinguish that from a tampering error so
> the client knows to refresh rather than bounce the user to login.

**Follow-up — "How do you revoke a JWT?"**

> You cannot, and that is the honest weakness of stateless tokens. Once signed, a
> JWT is valid until it expires. My logout drops the refresh cookie but the
> access token stays technically valid for up to 15 minutes — which is precisely
> why it is short-lived.
>
> Real revocation needs server state: a denylist of revoked token ids checked on
> each request, or refresh-token families in a table so reuse can be detected and
> the whole family invalidated. Both trade statelessness for control. I would add
> the family table before this went anywhere real.

### 52. Why `Promise.all` in some places and sequential `await` in others?

> `Promise.all` when the operations are independent — in `listRequests` the
> incoming and outgoing queries do not depend on each other, so running them
> concurrently roughly halves the latency.
>
> Sequential `await` when there is a real dependency, or when ordering matters.
> In the friendship transaction the writes run in sequence inside a session,
> because that is what makes them one atomic unit.
>
> The trap with `Promise.all` is that it rejects on the **first** failure while
> the others keep running — so a partially applied multi-write is possible. When
> I need every outcome regardless, `Promise.allSettled` is the right call.

---

## L. Behavioural & judgement

### 38. Tell me about a technical decision you reversed.

> I originally emitted new messages into a room per chat, which is the obvious
> design and what most tutorials do. Testing with two accounts, I found that
> messages only arrived if the recipient had that exact conversation open —
> otherwise the sidebar and unread badge went stale.
>
> I switched to a room per **user**. The trigger was noticing the bug only
> appeared when I tested the way a real user behaves, with the chat list on
> screen rather than the conversation. It reinforced something I try to hold
> onto: test the boring path, not just the demo path.

### 39. How do you decide when something is "good enough" to ship?

> I ask what breaks and who it hurts. Missing E2E encryption is a documented
> architectural boundary — it does not corrupt data or lock anyone out. A race
> that creates duplicate conversations silently splits someone's history, which
> is not recoverable by the user. So I fixed the races and wrote the encryption
> gap down.
>
> The rule I apply: correctness bugs that lose or corrupt data block a release;
> missing features are a roadmap. And anything I knowingly leave out gets written
> in the README, because an undocumented limitation is indistinguishable from a
> bug to whoever picks it up next.

### 40. What part of this code are you least happy with?

> `fetchChats`. It runs an aggregation across every one of the user's chats to
> compute unread counts on every call. At twenty conversations it is invisible;
> at five hundred it is the slowest endpoint in the app, and it is called on
> every page load.
>
> The right design is a per-user unread counter maintained at write time — you
> pay a small write cost to make the read constant-time. I left it because
> correct-and-simple beat fast-and-fiddly at this scale, but it is the first
> thing I would change under real load.

---

## M. Questions to ask them

Asking good questions is part of the evaluation. These are calibrated to a
backend/full-stack SDE-2 role.

- How do you handle schema migrations on a live database — is there a
  standard process, or is it per-team?
- What does on-call look like, and what is the most common class of incident?
- Where does the team sit on integration tests versus end-to-end tests? I have
  opinions but I would rather match the codebase.
- When someone proposes a design that is more complex than the problem needs,
  how does that conversation usually go here?
- What is something the team knows is technical debt but has not prioritised?

---

## Final advice

**Ten things to be able to say without hesitating**, because they are what
separates an SDE-2 answer from an SDE-1 one:

1. Compound index field order is **equality, sort, range** — and why the sort
   being served by the index removes the in-memory sort.
2. Cursor pagination beats `skip` for **correctness under concurrent writes**,
   not just speed.
3. A uniqueness constraint is the only non-racy way to enforce "at most one" —
   application-level checking is read-then-write.
4. Idempotency keys belong on the write path of anything retryable.
5. Access token in memory, refresh token httpOnly — and what each one still
   does not protect against.
6. Emit to a room per **user**, not per chat, so all devices stay in sync.
7. Presence is a set per user; offline is the **last** socket leaving.
8. Denormalisation is a read optimisation that you pay for with a consistency
   obligation — name both halves.
9. The socket is best-effort; the database is the source of truth. That is what
   makes network failures survivable.
10. Say what you did **not** build and why. Naming your gaps reads as
    judgement; pretending they do not exist reads as inexperience.

**And when you do not know something:** say so, then reason out loud toward an
answer. Interviewers are calibrating how you think, not running a quiz. "I have
not implemented that, but here is how I would approach it" is a strong answer.
Confidently making something up is the only fatal one.
