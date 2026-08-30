# Flow Diagrams

Every significant path through ChatApp, drawn. Diagrams are Mermaid, which
GitHub renders natively — no images to keep in sync with the code.

- [1. System architecture](#1-system-architecture)
- [2. Entity relationships](#2-entity-relationships)
- [3. Registration & login](#3-registration--login)
- [4. Silent session restore](#4-silent-session-restore)
- [5. Token refresh on 401](#5-token-refresh-on-401)
- [6. Friend request lifecycle](#6-friend-request-lifecycle)
- [7. Sending a friend request](#7-sending-a-friend-request)
- [8. Opening a 1:1 chat](#8-opening-a-11-chat)
- [9. Sending a message](#9-sending-a-message)
- [10. Message state machine](#10-message-state-machine)
- [11. Socket lifecycle & presence](#11-socket-lifecycle--presence)
- [12. Typing indicator](#12-typing-indicator)
- [13. Loading older messages](#13-loading-older-messages)
- [14. Request middleware pipeline](#14-request-middleware-pipeline)
- [15. Deployment topology](#15-deployment-topology)

---

## 1. System architecture

```mermaid
flowchart TB
    subgraph Browser["🖥️  Browser — React SPA"]
        UI["<b>Pages</b><br/>Login · Register · ChatPage"]
        CTX["<b>Context providers</b><br/>AuthContext — user, tokens<br/>SocketContext — connection, presence<br/>ChatContext — chats, messages<br/>ThemeContext — light / dark"]
        AX["<b>axios</b><br/>+ single-flight refresh interceptor"]
        IOC["<b>socket.io-client</b><br/>auto-reconnect"]
        UI --> CTX
        CTX --> AX
        CTX --> IOC
    end

    subgraph Server["⚙️  Node.js — Express + Socket.IO"]
        MW["<b>Middleware chain</b><br/>helmet → cors → json → cookies<br/>→ rateLimit → zod → protect"]
        CTRL["<b>Controllers</b><br/>auth · user · friend · chat · message"]
        REG["<b>Socket registry</b><br/>userId → Set of socketIds"]
        MOD["<b>Mongoose models</b>"]
        MW --> CTRL
        CTRL -->|emitToUser| REG
        CTRL --> MOD
    end

    DB[("<b>MongoDB</b><br/>users · friendships<br/>chats · messages")]

    AX ==>|"HTTPS — request / response"| MW
    IOC <==>|"WebSocket — server push"| REG
    MOD --> DB

    style Browser fill:#e8f5e9,stroke:#00a884,stroke-width:2px
    style Server fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style DB fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
```

The controllers are the only layer touching both the database and the socket
registry. That is deliberate: a write and the push announcing it happen in one
place, so they cannot drift apart.

---

## 2. Entity relationships

```mermaid
erDiagram
    USER ||--o{ FRIENDSHIP : "requests / receives"
    USER }o--o{ CHAT : "participates in"
    USER ||--o{ MESSAGE : sends
    CHAT ||--o{ MESSAGE : contains
    CHAT ||--o| MESSAGE : "latestMessage"
    MESSAGE ||--o| MESSAGE : "replyTo"

    USER {
        ObjectId _id PK
        string name
        string username UK
        string email UK
        string password "bcrypt, select:false"
        string avatar
        string about
        ObjectId_array friends "denormalised"
        ObjectId_array blocked
        bool isOnline
        date lastSeen
    }

    FRIENDSHIP {
        ObjectId _id PK
        ObjectId requester FK
        ObjectId recipient FK
        string status "pending|accepted|rejected|blocked"
        string pairKey UK "sorted id pair"
        date respondedAt
    }

    CHAT {
        ObjectId _id PK
        string name
        bool isGroupChat
        ObjectId_array users FK
        ObjectId_array admins FK
        ObjectId latestMessage FK
        string pairKey UK "1:1 only, partial index"
    }

    MESSAGE {
        ObjectId _id PK
        ObjectId chat FK
        ObjectId sender FK
        string content
        string type "text|image|system"
        ObjectId replyTo FK
        receipt_array deliveredTo
        receipt_array readBy
        ObjectId_array deletedFor
        bool isDeleted
        string clientId "idempotency key"
    }
```

---

## 3. Registration & login

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant C as React client
    participant A as API
    participant DB as MongoDB

    U->>C: submits credentials
    C->>A: POST /api/auth/login
    Note over A: authLimiter — 20 per 15 min
    A->>A: Zod parses body
    A->>DB: findOne email OR username, select +password
    DB-->>A: user document

    alt no user, or bcrypt mismatch
        A-->>C: 401 "Invalid credentials"
        Note right of A: identical message for both cases,<br/>so the form is not a user-enumeration oracle
        C-->>U: shows error
    else credentials valid
        A->>A: sign access token, 15 min
        A->>A: sign refresh token, 7 days
        A-->>C: 200 body: user + accessToken
        Note right of A: Set-Cookie refresh_token<br/>HttpOnly · Secure · SameSite · path=/api/auth
        C->>C: hold accessToken in memory only
        C->>A: open socket, token in handshake
        C-->>U: chat screen
    end
```

The access token is returned in the **body** and kept in a JS variable; the
refresh token is set as an httpOnly cookie the client can never read.

---

## 4. Silent session restore

What happens on a hard refresh, when the in-memory access token is gone but the
refresh cookie survives.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant C as AuthContext
    participant A as API

    B->>C: app mounts, booting = true
    C->>A: POST /api/auth/refresh (cookie sent automatically)

    alt cookie valid
        A-->>C: 200 user + new accessToken
        C->>C: setAccessToken, setUser
        Note over C: routes render the chat screen —<br/>the login page never flashes
    else no or expired cookie
        A-->>C: 401
        C->>C: setUser(null)
        Note over C: Guard redirects to /login
    end
    C->>B: booting = false
```

The `booting` flag exists so the route guard shows a splash instead of briefly
redirecting a logged-in user to `/login`.

---

## 5. Token refresh on 401

The single-flight problem: several requests fail at once, but only one refresh
must happen.

```mermaid
flowchart TD
    R1["Request A → 401"] --> CHK
    R2["Request B → 401"] --> CHK
    R3["Request C → 401"] --> CHK

    CHK{"Already retried?<br/>Is this the refresh call itself?"}
    CHK -->|yes| FAIL["Reject — do not loop"]
    CHK -->|no| SF{"Is a refresh<br/>already in flight?"}

    SF -->|yes| WAIT["Await the existing promise"]
    SF -->|no| NEW["POST /api/auth/refresh<br/>cache the promise"]

    NEW --> OK{"Refresh succeeded?"}
    WAIT --> OK

    OK -->|yes| SET["Store new access token"] --> RETRY["Replay the original request"]
    OK -->|no| LOGOUT["Clear token · onAuthFailure · redirect to /login"]
```

Without the single-flight cache, ten concurrent 401s fire ten refresh calls;
because refresh **rotates** the token, they invalidate each other and the user is
logged out for no reason.

---

## 6. Friend request lifecycle

```mermaid
stateDiagram-v2
    [*] --> none : no relationship

    none --> pending : A sends request
    pending --> accepted : recipient accepts
    pending --> rejected : recipient rejects
    pending --> none : sender cancels

    rejected --> pending : A sends again, same row reopened

    accepted --> none : either side unfriends
    accepted --> blocked : either side blocks
    none --> blocked : block without friendship
    blocked --> none : unblock

    note right of pending
        If B sends a request while A's is
        pending, it is treated as an ACCEPT
        instead of a second row
    end note

    note right of accepted
        Transaction: status = accepted
        + $addToSet on both users' friends
    end note
```

Only the **recipient** may accept or reject; only the **sender** may cancel.
Both are enforced server-side and verified with negative tests.

---

## 7. Sending a friend request

```mermaid
flowchart TD
    START["POST /api/friends/request"] --> SELF{"Target is me?"}
    SELF -->|yes| E400["400 cannot add yourself"]
    SELF -->|no| EXISTS{"Target exists?"}
    EXISTS -->|no| E404["404 user not found"]
    EXISTS -->|yes| BLK{"They blocked me?"}
    BLK -->|yes| E403["403 forbidden"]
    BLK -->|no| LOOK["Look up friendship by pairKey"]

    LOOK --> FOUND{"Row exists?"}
    FOUND -->|no| CREATE["Create pending row"]
    FOUND -->|yes| ST{"status?"}

    ST -->|accepted| E409A["409 already friends"]
    ST -->|"pending, I am the requester"| E409B["409 request already sent"]
    ST -->|"pending, THEY are the requester"| ACC["Accept it — they already asked"]
    ST -->|rejected| REOPEN["Reopen the same row as pending"]

    CREATE --> EMIT["emit friend:request to recipient"]
    REOPEN --> EMIT
    EMIT --> OK201["201 request"]
    ACC --> OK200["200 accepted, both users updated"]
```

---

## 8. Opening a 1:1 chat

The race that a naive implementation loses.

```mermaid
sequenceDiagram
    autonumber
    participant P as Prince
    participant AI as Aisha
    participant A as API
    participant DB as MongoDB

    Note over P,AI: both tap "message" at the same instant

    P->>A: POST /api/chats {userId: aisha}
    AI->>A: POST /api/chats {userId: prince}

    A->>A: friends check — 403 if not friends
    A->>A: pairKey = sort(princeId, aishaId).join("_")

    par concurrent upserts on the same key
        A->>DB: findOneAndUpdate {pairKey} upsert
        A->>DB: findOneAndUpdate {pairKey} upsert
    end

    Note over DB: unique partial index on pairKey<br/>one insert wins, the other matches<br/>the now-existing document

    DB-->>A: the same chat, twice
    A-->>P: 200 chat
    A-->>AI: 200 chat
    Note over P,AI: one conversation, not two
```

`findOne`-then-`create` would let both requests find nothing and both create,
splitting the history across two chats. The uniqueness constraint is the only
non-racy fix — an application-level check is a read-then-write.

---

## 9. Sending a message

```mermaid
sequenceDiagram
    autonumber
    participant AI as Aisha (sender)
    participant C as Her client
    participant A as API
    participant DB as MongoDB
    participant S as Socket registry
    participant P1 as Prince laptop
    participant P2 as Prince phone

    C->>C: render bubble immediately<br/>temp id = clientId, pending = true
    C->>A: POST /api/messages {chatId, content, clientId}

    A->>DB: load chat, assert caller is a participant
    alt not a participant
        A-->>C: 403
    end

    A->>DB: insert message<br/>deliveredTo = participants currently online<br/>readBy = [sender]

    alt duplicate clientId — this is a retry
        DB-->>A: E11000 duplicate key
        A->>DB: find the original message
        Note right of A: idempotent — returns the first copy,<br/>never creates a second
    end

    A->>DB: update chat.latestMessage
    A->>S: emitToUsers(participants, "message:new")
    S-->>P1: message:new
    S-->>P2: message:new
    S-->>C: message:new (own echo)
    A-->>C: 201 message

    C->>C: replace optimistic bubble<br/>dedupe on _id AND clientId
    Note over P1,P2: every device updates —<br/>sidebar and unread badge included
```

Emitting to a room **per user** rather than per chat is what makes the phone
update even with the conversation closed.

---

## 10. Message state machine

```mermaid
stateDiagram-v2
    [*] --> pending : optimistic render, clock icon
    pending --> sent : 201 from server, one tick
    pending --> failed : network error, red mark
    failed --> pending : user retries, same clientId

    sent --> delivered : recipient has a live socket, two grey ticks
    delivered --> read : recipient opens the chat, two blue ticks

    sent --> deletedAll : delete for everyone
    delivered --> deletedAll : delete for everyone
    read --> deletedAll : delete for everyone
    deletedAll : content blanked, row kept

    read --> hidden : delete for me
    hidden : added to deletedFor, others still see it
```

The row survives a "delete for everyone" because `replyTo` references point at
it and removing it would disturb pages already loaded on other clients.

---

## 11. Socket lifecycle & presence

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant IO as Socket.IO
    participant R as Presence registry
    participant DB as MongoDB
    participant F as Friends

    C->>IO: connect, auth.token = accessToken
    IO->>IO: io.use — verify JWT

    alt token invalid or missing
        IO-->>C: connect_error "Unauthorized socket connection"
        Note over IO: an unauthenticated socket never exists,<br/>so no handler re-checks identity
    else valid
        IO->>R: add socketId to set for userId
        IO->>IO: socket.join(userId) — the personal room

        alt this is the FIRST socket for the user
            IO->>DB: isOnline = true
            IO->>F: presence:online
        end

        IO-->>C: presence:snapshot — which friends are online
    end

    Note over C,IO: ... session ...

    C->>IO: disconnect (tab closed)
    IO->>R: remove socketId from the set

    alt set is now EMPTY — last device gone
        IO->>DB: isOnline = false, lastSeen = now
        IO->>F: presence:offline
    else other devices remain
        Note over R: still online — closing one of three<br/>tabs must not mark you offline
    end
```

---

## 12. Typing indicator

```mermaid
sequenceDiagram
    autonumber
    participant U as Aisha typing
    participant C as Her client
    participant S as Server
    participant P as Prince

    U->>C: first keystroke
    C->>S: emit "typing" {chatId}
    S->>P: typing {chatId, name}
    P->>P: show animated dots

    loop further keystrokes
        U->>C: keystroke
        C->>C: reset the 1.5s debounce timer
        Note right of C: no event emitted —<br/>a sentence costs 2 events, not 40
    end

    alt 1.5s of silence
        C->>S: emit "typing:stop"
    else message sent
        C->>S: emit "typing:stop"
    else chat switched or component unmounts
        C->>S: emit "typing:stop"
        Note right of C: without this the indicator<br/>is stranded on the other side
    end

    S->>P: typing:stop
    P->>P: hide dots
```

---

## 13. Loading older messages

```mermaid
flowchart TD
    SCROLL["User scrolls up"] --> NEAR{"scrollTop < 60px<br/>and hasMore<br/>and not already loading?"}
    NEAR -->|no| IDLE["Do nothing"]
    NEAR -->|yes| SAVE["Record current scrollHeight"]
    SAVE --> FETCH["GET /api/messages/:chatId<br/>?cursor=oldest.createdAt&limit=30"]

    FETCH --> Q["find chat, createdAt < cursor<br/>sort createdAt -1, _id -1<br/>limit 31"]
    Q --> IDX["Served by index<br/>{chat:1, createdAt:-1, _id:-1}<br/>— sort needs no in-memory pass"]
    IDX --> EXTRA{"Got 31 rows?"}
    EXTRA -->|yes| MORE["hasMore = true<br/>drop the extra row"]
    EXTRA -->|no| END["hasMore = false<br/>nextCursor = null"]

    MORE --> PREPEND["Reverse page, prepend to state"]
    END --> PREPEND
    PREPEND --> RESTORE["scrollTop = newHeight − savedHeight"]
    RESTORE --> DONE["Reading position preserved —<br/>no visual jump"]
```

The 31st row is how the endpoint knows another page exists without a second
`count` query.

---

## 14. Request middleware pipeline

```mermaid
flowchart LR
    REQ["Request"] --> H["helmet<br/>security headers"]
    H --> CORS["cors<br/>origin allow-list<br/>credentials: true"]
    CORS --> JSON["express.json<br/>limit 1mb"]
    JSON --> COOK["cookieParser"]
    COOK --> LOG["morgan<br/>dev only"]
    LOG --> RL["rateLimit<br/>300/min · 20 per 15min on auth"]
    RL --> ROUTE["Router match"]
    ROUTE --> Z["Zod validate<br/>replaces req.body with parsed data"]
    Z --> PROT["protect<br/>verify JWT, load user"]
    PROT --> CTRL["Controller<br/>authorisation check, then work"]
    CTRL --> RES["Response"]

    Z -.->|invalid| EH
    PROT -.->|401| EH
    CTRL -.->|throw ApiError| EH
    ROUTE -.->|no match| NF["notFound"] --> EH
    EH["errorHandler<br/>maps ValidationError · CastError · E11000<br/>hides stack in production"] --> RES
```

Zod runs **before** `protect` on public routes and before the controller
everywhere, so no operator object like `{"$ne": null}` can ever reach a query.

---

## 15. Deployment topology

```mermaid
flowchart TB
    subgraph U["Users"]
        BR["Browser"]
    end

    subgraph V["Vercel — static CDN"]
        SPA["React build<br/>index.html + hashed assets<br/>SPA rewrite to /index.html"]
    end

    subgraph R["Render / Railway / Fly — long-lived Node process"]
        API["Express + Socket.IO<br/>node backend/server.js"]
    end

    subgraph M["MongoDB Atlas — replica set"]
        DB[("whatsapp_clone")]
    end

    BR -->|"HTTPS, static assets"| SPA
    BR -->|"HTTPS /api/* — CORS + credentials"| API
    BR <-->|"WSS /socket.io — persistent"| API
    API -->|"mongodb+srv, IP allow-list"| DB

    style V fill:#e8f5e9,stroke:#00a884
    style R fill:#e3f2fd,stroke:#1976d2
    style M fill:#fff3e0,stroke:#ef6c00
```

**Why the API is not on Vercel.** Vercel runs serverless functions: short-lived,
stateless, no persistent connection. A WebSocket has to stay open, and the
presence registry is in-process memory. Both are incompatible with that model,
so the API needs a host that keeps a process alive. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the full reasoning and the alternatives.
