# API Reference

Base URL: `http://localhost:5000/api`

All request and response bodies are JSON. Protected routes require:

```
Authorization: Bearer <accessToken>
```

### Response envelope

Success:
```json
{ "success": true, "...": "payload" }
```

Failure:
```json
{ "success": false, "message": "Validation failed", "details": ["password: at least 8 characters"] }
```

`details` is present only for validation errors. `stack` is included outside production.

### Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | OK / Created |
| 400 | Validation failed, or a malformed id |
| 401 | Missing, invalid or expired access token |
| 403 | Authenticated but not permitted (not a friend, not a participant, not an admin) |
| 404 | Not found |
| 409 | Conflict (duplicate email/username, request already sent, already friends) |
| 429 | Rate limited |
| 500 | Unhandled server error |

### Rate limits

| Scope | Limit |
|---|---|
| `/api/auth/register`, `/api/auth/login` | 20 requests / 15 min |
| all other `/api/*` | 300 requests / min |

---

## Auth — `/api/auth`

### `POST /register`
Public.

```json
{
  "name": "Prince Singh",
  "username": "prince",
  "email": "prince@demo.com",
  "password": "Password123",
  "avatar": "https://…"
}
```

Password must be 8–72 characters and contain a letter and a digit. Username is
3–24 characters, lowercase, `a-z 0-9 _ .` only.

**201** → `{ success, user, accessToken }`, plus a `refresh_token` httpOnly cookie.
**409** → email or username already in use.

### `POST /login`
Public. `identifier` accepts an email **or** a username.

```json
{ "identifier": "prince@demo.com", "password": "Password123" }
```

**200** → `{ success, user, accessToken }` + refresh cookie.
**401** → `Invalid credentials` (identical for unknown user and wrong password, by design).

### `POST /refresh`
Public, authenticated by the refresh cookie. Rotates the refresh token.

**200** → `{ success, user, accessToken }`
**401** → missing, invalid or expired refresh token.

### `POST /logout`
Clears the refresh cookie. Always **200**.

### `GET /me`
Protected. **200** → `{ success, user }`.

---

## Users — `/api/users`

### `GET /?search=<term>&limit=<n>`
Protected. Case-insensitive match on name, username or email; excludes you.
`limit` defaults to 20, capped at 50. An empty `search` returns `[]`.

Each result carries the relationship, so the UI can render the correct action:

```json
{
  "success": true,
  "users": [
    { "_id": "…", "name": "Sam Okafor", "username": "sam",
      "relation": "none", "requestId": null }
  ]
}
```

`relation` is one of `friends`, `incoming`, `outgoing`, `none`.
`requestId` is non-null when `relation` is `incoming` or `outgoing`.

### `GET /:userId`
Protected. **200** → `{ success, user }` · **404** if unknown.

### `PUT /me`
Protected. Any subset of:

```json
{ "name": "New Name", "about": "Busy", "avatar": "https://…" }
```

---

## Friends — `/api/friends`

### `GET /`
Protected. **200** → `{ success, friends: [user] }`.

### `GET /requests`
Protected. **200** → `{ success, incoming: [...], outgoing: [...] }`.
`incoming` entries populate `requester`; `outgoing` populate `recipient`.

### `POST /request`
Protected. `{ "userId": "<id>" }`

**201** → `{ success, request }`.
Sends `friend:request` over the socket to the recipient.

Special cases:
- If the target already sent *you* a pending request, this **accepts** it instead.
- A previously rejected pair reopens the same document.

**400** adding yourself · **403** they blocked you · **404** no such user ·
**409** already friends or request already sent.

### `PUT /request/:requestId/accept`
Protected, **recipient only**. **200** → `{ success, request }` with `status: "accepted"`.
Adds each user to the other's friends list and emits `friend:accepted` to both.

**403** if you are not the recipient · **404** if not found or not pending.

### `PUT /request/:requestId/reject`
Protected, recipient only. **200** → request with `status: "rejected"`.

### `DELETE /request/:requestId`
Protected, **sender only** — cancels a request you sent. **200**.

### `DELETE /:userId`
Protected. Unfriend: deletes the friendship and removes both denormalised
entries. Emits `friend:removed`. **200**.

### `POST /block` · `DELETE /block/:userId`
Protected. Block removes the friendship and marks the relationship `blocked`;
unblock reverses it. **200**.

---

## Chats — `/api/chats`

### `GET /`
Protected. Your conversations, most recently active first, each with
`unreadCount` computed in a single aggregation.

```json
{
  "success": true,
  "chats": [
    { "_id": "…", "isGroupChat": false,
      "users": [ … ], "latestMessage": { … }, "unreadCount": 2 }
  ]
}
```

### `POST /`
Protected. `{ "userId": "<friendId>" }`

Opens the 1:1 chat, creating it if needed. Idempotent — calling it twice returns
the same chat, guaranteed by a unique index on `pairKey`.

**200** → `{ success, chat }`
**400** chatting with yourself · **403** not friends.

### `POST /group`
Protected.

```json
{ "name": "Weekend Plans", "users": ["<id>", "<id>"] }
```

At least 2 other users (3 including you). The creator becomes the only admin.

**201** → `{ success, chat }` · **403** if any listed user is not your friend.

### `PUT /group/rename` — admin only
`{ "chatId": "…", "name": "New name" }` → **200** `{ success, chat }`.

### `PUT /group/add` — admin only
`{ "chatId": "…", "userId": "…" }` → **200**.

### `PUT /group/remove` — admin, or yourself
`{ "chatId": "…", "userId": "…" }`

Removing your own id is how you leave a group. If the last admin leaves, the
oldest remaining member is promoted so the group is never left unmanageable.

---

## Messages — `/api/messages`

### `GET /:chatId?cursor=<ISO date>&limit=<n>`
Protected, participants only. Cursor-paginated, oldest→newest within the page so
the client can append directly.

```json
{
  "success": true,
  "messages": [ … ],
  "nextCursor": "2026-08-30T07:37:29.747Z",
  "hasMore": true
}
```

`limit` defaults to 30, capped at 100. Pass the previous `nextCursor` to fetch
the page before it. `hasMore: false` (and `nextCursor: null`) means you have
reached the start of the conversation.

**403** if you are not a participant.

### `POST /`
Protected, participants only.

```json
{
  "chatId": "…",
  "content": "Hello",
  "type": "text",
  "replyTo": null,
  "clientId": "1730-abc123"
}
```

`clientId` is an optional idempotency key. Re-sending with the same
`clientId` returns the original message rather than creating a duplicate — send
one per logical message so retries are safe.

**201** → `{ success, message }`. Emits `message:new` to every participant.

### `PUT /:chatId/read`
Protected. Marks all messages in the chat from other people as read.

**200** → `{ success, updated: <count> }`. Emits `message:read` when `updated > 0`.
Idempotent — calling it again returns `updated: 0`.

### `DELETE /:messageId?scope=me|everyone`
Protected.

- `scope=me` (default) hides it for you only.
- `scope=everyone` requires that you sent it; blanks the content, keeps the row,
  and emits `message:deleted`.

**403** deleting someone else's message for everyone.

---

## Health

### `GET /api/health`
Public. **200** → `{ success: true, status: "ok", uptime: 1234.5 }`.

---

## WebSocket

Connect to the server origin with the access token in the handshake:

```js
const socket = io("http://localhost:5000", { auth: { token: accessToken } });
```

An invalid or missing token fails the handshake with `Unauthorized socket
connection` — no unauthenticated socket is ever created.

### Client → server

| Event | Payload | Purpose |
|---|---|---|
| `chat:join` | `chatId` | Join the chat room (scopes typing indicators) |
| `chat:leave` | `chatId` | Leave it |
| `typing` | `{ chatId }` | You started typing |
| `typing:stop` | `{ chatId }` | You stopped |

### Server → client

| Event | Payload | When |
|---|---|---|
| `message:new` | `{ message, chatId }` | Someone sent a message |
| `message:read` | `{ chatId, readerId, at }` | Someone read the chat |
| `message:deleted` | `{ chatId, messageId, scope }` | Deleted for everyone |
| `chat:new` | `{ chat }` | You were added to a chat |
| `chat:updated` | `{ chat }` | Group renamed, member added/removed |
| `friend:request` | `{ request }` | You received a friend request |
| `friend:accepted` | `{ request }` | A request was accepted |
| `friend:removed` | `{ userId }` | Someone unfriended you |
| `presence:online` | `{ userId }` | A friend came online |
| `presence:offline` | `{ userId, lastSeen }` | A friend went offline |
| `presence:snapshot` | `{ online: [userId] }` | Sent once on connect |
| `typing` | `{ chatId, userId, name }` | Someone is typing |
| `typing:stop` | `{ chatId, userId }` | They stopped |

Event names are defined once in `backend/socket/events.js` and mirrored in
`frontend/src/lib/events.js` — keep the two in sync.

### Delivery semantics

Socket events are **best-effort notifications**, not the source of truth. A
client that misses one recovers by refetching on reconnect or chat open, so no
correctness property depends on an event arriving.
