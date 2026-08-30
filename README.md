# ChatApp — a real-time messaging app (MERN + Socket.IO)

A WhatsApp-style chat application: friend requests, 1:1 and group conversations,
live presence, typing indicators, and delivery/read receipts — built on
React + Vite, Express, Socket.IO and MongoDB.

**🔗 Live demo (UI):** <https://chatapp-prince.vercel.app>

> ⚠️ The frontend is deployed; the API is **not yet**. Sign-in will fail until a
> backend is running and `VITE_API_URL` points at it — see
> [DEPLOYMENT.md](docs/DEPLOYMENT.md). The API cannot go on Vercel: serverless
> functions cannot hold a WebSocket open. Run it locally to see it fully working.

> **Docs:** [Architecture & system design](docs/ARCHITECTURE.md) ·
> [Flow diagrams](docs/FLOWS.md) · [API reference](docs/API.md) ·
> [Deployment](docs/DEPLOYMENT.md) · [Interview Q&A (SDE-2)](docs/INTERVIEW_QA.md)

---

## Contents

- [Features](#features)
- [Documentation](#documentation)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Connecting MongoDB Atlas](#connecting-mongodb-atlas)
- [Project layout](#project-layout)
- [Environment variables](#environment-variables)
- [How the core flows work](#how-the-core-flows-work)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [Known limits & what I would build next](#known-limits--what-i-would-build-next)

---

## Features

**Accounts & auth**
- Register with name, unique username, email and password
- Log in with **either** email or username
- Passwords hashed with bcrypt (cost 10); the hash is `select: false` so no query leaks it
- Short-lived **access token** (15 min, in memory) + **refresh token** (7 days, httpOnly cookie)
- Silent session restore on page reload; automatic single-flight token refresh on 401
- Rate limiting on the auth endpoints

**Friends**
- Search people by name, `@username` or email — each result is annotated with your
  current relationship, so the UI shows the right button with no extra request
- Send / accept / reject / cancel friend requests, unfriend, block and unblock
- **You can only message people you are actually friends with**

**Chat**
- 1:1 conversations and group chats with admin controls (rename, add, remove, leave)
- Real-time delivery over WebSockets, with optimistic send and idempotent retry
- Typing indicators, online/last-seen presence, unread badges
- Read receipts with WhatsApp's tick model — sent / delivered / read
- Reply-to-message, delete for me, delete for everyone
- Cursor-paginated history with infinite scroll upward

**UI/UX**
- Light and dark themes, remembered per browser
- Responsive: a single pane on mobile, two panes on desktop
- Day dividers, message clustering, avatar fallbacks, empty states

---

## Documentation

| Document | What is in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Requirements, data model, indexing strategy, auth design, consistency, the path to multiple instances, and the trade-offs I would defend |
| [docs/FLOWS.md](docs/FLOWS.md) | **15 diagrams** — system architecture, ER model, auth and refresh sequences, friend-request state machine, message fan-out, presence lifecycle, pagination, middleware pipeline, deployment topology |
| [docs/API.md](docs/API.md) | Every endpoint with request/response shapes, status codes, and the full WebSocket event table |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Atlas → API host → Vercel, why the API cannot be serverless, cross-domain cookies, and a post-deploy checklist |
| [docs/INTERVIEW_QA.md](docs/INTERVIEW_QA.md) | **52 SDE-2 questions** with answers grounded in this code, plus follow-ups interviewers actually ask |

Diagrams are Mermaid, so they render directly on GitHub — there are no image
files to drift out of sync with the code.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + Vite | Fast HMR; Vite's dev proxy removes CORS friction |
| Styling | Tailwind CSS | Design tokens in one config; no runtime cost |
| State | React Context + hooks | Three well-scoped providers beat a store for this size |
| Routing | React Router v7 | Guarded routes with a boot splash |
| Transport | axios + socket.io-client | REST for reads/writes, WebSocket for push |
| API | Express 4 | Small, explicit middleware chain |
| Realtime | Socket.IO 4 | Rooms, auto-reconnect, polling fallback |
| Database | MongoDB + Mongoose 8 | Document model fits chat; schema validation at the ODM |
| Validation | Zod | One schema per endpoint, parsed before the controller |
| Security | helmet, cors, express-rate-limit, bcryptjs, jsonwebtoken | |

---

## Quick start

### Prerequisites

- **Node.js 20.19+ or 22.12+** — Vite 7 will not start the dev server on older
  versions. An `.nvmrc` is included, so `nvm use` picks the right one.
- MongoDB — a local `mongod`, or a free MongoDB Atlas cluster.

```bash
nvm use                 # reads .nvmrc -> Node 22
```

### 1. Install

```bash
npm run install:all     # installs backend + frontend dependencies
```

### 2. Configure

```bash
cp .env.example .env
```

Then edit `.env` — at minimum set `MONGO_URI`. Generate real secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Seed demo data (optional but recommended)

```bash
npm run seed
```

This creates five users with a ready-made social graph, a conversation and a
group. Every account uses the password `Password123`:

| Email | Username |
|---|---|
| `prince@demo.com` | `@prince` |
| `aisha@demo.com` | `@aisha` |
| `rohit@demo.com` | `@rohit` |
| `meera@demo.com` | `@meera` |
| `sam@demo.com` | `@sam` |

> ⚠️ `npm run seed` **deletes every document** in the users, chats, messages and
> friendships collections first. Never point it at data you care about.

### 4. Run

```bash
npm run dev             # API on :5000 and web on :5173, together
```

Open <http://localhost:5173>. To see realtime working, log in as `prince` in one
browser and `aisha` in a private window, and watch messages, typing indicators
and presence update live.

---

## Connecting MongoDB Atlas

The Atlas **console URL** (`https://cloud.mongodb.com/v2/<projectId>`) is not a
connection string — the driver cannot use it. To get the real one:

1. In Atlas, open your cluster and click **Connect**.
2. Choose **Drivers** → **Node.js**.
3. Copy the string, which looks like:

   ```
   mongodb+srv://<user>:<password>@<cluster>.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

4. Replace `<password>` with the **database user's** password (not your Atlas
   login), and insert the database name before the `?`:

   ```
   MONGO_URI=mongodb+srv://appuser:s3cret@cluster0.ab12c.mongodb.net/whatsapp_clone?retryWrites=true&w=majority
   ```

5. Under **Network Access**, add your IP address — otherwise every connection
   times out with `ECONNREFUSED` / `ServerSelectionTimeoutError`.

If the password contains `@`, `:`, `/` or `#`, percent-encode it
(`@` → `%40`), or the URI will not parse.

**Atlas is worth using here:** it runs as a replica set, so the `acceptFriendship`
transaction takes the real transactional path. A standalone local `mongod` has no
transaction support, and the code falls back to sequential idempotent writes.

---

## Project layout

```
chat-backend/
├── backend/
│   ├── config/          env validation (fail-fast), Mongo connection
│   ├── models/          User, Friendship, Chat, Message
│   ├── controllers/     auth, user, friend, chat, message
│   ├── routes/          one router per resource
│   ├── middleware/      auth guard, error handler, Zod validate, rate limits
│   ├── socket/          Socket.IO setup, presence registry, event names
│   ├── validators/      Zod schemas
│   ├── seed/            demo data generator
│   └── server.js        composition root
├── frontend/
│   └── src/
│       ├── api/         axios instance + refresh interceptor
│       ├── context/     Auth, Socket, Chat, Theme providers
│       ├── components/  ChatList, ChatWindow, MessageBubble, FriendsPanel, …
│       ├── pages/       Login, Register, ChatPage
│       └── lib/         date formatting, socket event constants
└── docs/                ARCHITECTURE.md, API.md, INTERVIEW_QA.md
```

---

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | `development` | `production` serves `frontend/dist` and hides stack traces |
| `MONGO_URI` | **yes** | — | Server refuses to boot without it |
| `JWT_ACCESS_SECRET` | **yes** | — | Long random string |
| `JWT_REFRESH_SECRET` | **yes** | — | Must differ from the access secret |
| `ACCESS_TOKEN_TTL` | no | `15m` | |
| `REFRESH_TOKEN_TTL` | no | `7d` | |
| `CLIENT_URL` | no | `http://localhost:5173` | CORS origin allow-list |

`config/env.js` validates the required three at boot and exits with a clear
message rather than failing later on the first request.

---

## How the core flows work

### Authentication

```
POST /api/auth/login
  └─ access token  (15 min)  → returned in JSON, held in a JS variable
  └─ refresh token (7 days)  → httpOnly, Secure, SameSite cookie, path=/api/auth
```

The access token never touches `localStorage`, so an XSS payload cannot read it
back out of storage. The refresh token is httpOnly, so JS cannot read it at all.
When any request returns 401, an axios interceptor calls `/api/auth/refresh`
once — **single-flight**, so ten concurrent 401s produce one refresh, not ten —
retries the original request, and only logs out if the refresh itself fails.

### Sending a message

1. The client renders the bubble immediately with a temporary `clientId` (optimistic UI).
2. `POST /api/messages` persists it and stamps `deliveredTo` for every recipient
   who currently has a live socket.
3. The server emits `message:new` into **each participant's personal room**, so
   all of a user's devices update — not just those with the chat open.
4. The client swaps the optimistic bubble for the server's copy.
5. If the request is retried, the unique `{chat, clientId}` index makes the
   insert fail with a duplicate-key error, and the server returns the original
   message instead of creating a second copy.

### Presence

Every socket joins a room named after its user id. A registry maps
`userId → Set<socketId>`, so a user with a phone and two tabs is one online
user. `isOnline` is "the set is non-empty", and the user only flips to offline
when their **last** socket disconnects.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web concurrently (the usual one) |
| `npm run server` | API only, with nodemon |
| `npm run client` | Vite dev server only |
| `npm run seed` | Reset and repopulate the database |
| `npm run build` | Production build of the frontend |
| `npm start` | Run the API in production mode |
| `npm run install:all` | Install both dependency trees |

---

## Deployment

| Piece | Host | Why |
|---|---|---|
| Frontend | **Vercel** | Static Vite bundle — a CDN is exactly right |
| API | **Render / Railway / Fly** | Needs a long-lived process for WebSockets |
| Database | **MongoDB Atlas** | Replica set, so transactions take their real path |

**The API cannot run on Vercel.** Serverless functions are short-lived and
stateless: they cannot hold a WebSocket open, and the in-process presence
registry would be empty on every invocation. Full steps, cross-domain cookie
setup and a post-deploy checklist are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
cd frontend && vercel --prod       # frontend
# then set VITE_API_URL to the deployed API origin and redeploy
```

---

## Troubleshooting

**`TypeError: crypto.hash is not a function` when starting Vite**
Your Node is older than 20.19. Run `nvm use` (the repo pins Node 22 via `.nvmrc`).

**`Port 5173 is in use, trying another one...`**
Another dev server is running. Vite picks the next free port — read the actual
URL it prints. The API proxy follows automatically.

**`ServerSelectionTimeoutError` / `ECONNREFUSED 127.0.0.1:27017`**
No local MongoDB. Either start one (`brew services start mongodb-community`) or
point `MONGO_URI` at Atlas.

**Atlas connects locally but not from a deployment**
Add the host's IP to Atlas **Network Access**. Many platforms use dynamic egress
IPs, which is what `0.0.0.0/0` is for — acceptable for a demo, not for production.

**`Transaction numbers are only allowed on a replica set member`**
You are on a standalone `mongod`. The code already catches this and falls back
to sequential writes; use Atlas or a replica set to exercise the real path.

**Login says "Invalid credentials" for a seeded user**
The seed only writes to the database in `MONGO_URI`. If you switched from local
to Atlas, re-run `npm run seed`.

**The deployed site loads but login fails**
Expected until the API is deployed. Set `VITE_API_URL` to the API origin and
**redeploy** — `VITE_*` variables are baked in at build time, not read at runtime.

**401s in the console right after the page loads**
Expected. The app probes `/api/auth/refresh` on boot to restore a session; with
no refresh cookie that correctly returns 401 and shows the login screen.

---

## Known limits & what I would build next

Being explicit about what this does *not* do is half of a good design discussion —
[the architecture doc](docs/ARCHITECTURE.md#scaling-beyond-one-process) covers the
reasoning in depth.

- **Single process only.** Presence lives in an in-process `Map` and Socket.IO
  has no adapter, so two Node instances would not see each other's sockets.
  Fix: `@socket.io/redis-adapter` plus Redis-backed presence.
- **Refresh tokens are stateless.** Logout drops the cookie but does not
  invalidate the token server-side. Fix: a token-family table with rotation and
  reuse detection.
- **No message encryption.** Messages are stored in plaintext. Real E2E
  encryption changes the whole architecture — the server must stop being able to
  read content, which rules out server-side search.
- **No media uploads.** `type` already allows `image`; the storage path would be
  a pre-signed S3 upload with the URL stored on the message.
- **No automated tests.** The flows here were verified manually and with a
  scripted browser run; Jest + Supertest for the API and Playwright for the UI
  are the natural next step.
- **No offline queue.** Messages sent while disconnected fail rather than
  queueing for retry.
