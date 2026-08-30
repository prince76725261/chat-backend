# Deployment Guide

## The short version

**The frontend goes on Vercel. The API cannot.**

Vercel runs serverless functions — a process spins up to handle a request and is
torn down after. That model is incompatible with this API in two specific ways:

1. **WebSockets need a connection that stays open.** A Socket.IO client holds a
   persistent connection for the whole session. A serverless function that lives
   for the duration of one request cannot hold one.
2. **The presence registry is in-process memory.** `userId → Set<socketId>` lives
   in a `Map` inside the Node process. Serverless functions do not share memory
   and do not persist between invocations, so the registry would be empty on
   every call.

So the API needs a host that keeps a process alive: **Render**, **Railway**,
**Fly.io**, **Heroku**, or any container platform. All of the below have a free
tier that is enough for a portfolio project.

```mermaid
flowchart LR
    U["Browser"] -->|"static assets"| V["<b>Vercel</b><br/>React build on the CDN"]
    U -->|"HTTPS /api/*"| R["<b>Render / Railway / Fly</b><br/>Express + Socket.IO<br/><i>long-lived process</i>"]
    U <-->|"WSS /socket.io"| R
    R -->|"mongodb+srv"| M[("<b>MongoDB Atlas</b><br/>replica set")]

    style V fill:#e8f5e9,stroke:#00a884,stroke-width:2px
    style R fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style M fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
```

> **If someone insists on Vercel-only**, the honest options are: drop realtime
> and poll the REST API on a timer, or replace Socket.IO with a hosted realtime
> service such as Pusher or Ably that holds the connection for you. Both are real
> architectural changes, not configuration — and "I know why it does not fit and
> here are the two ways round it" is a better interview answer than a broken
> deploy.

---

## Order of operations

Deploy in this order, because each step needs the URL from the one before:

1. **MongoDB Atlas** — the API needs a database before it can boot.
2. **API on Render** — the frontend needs its URL.
3. **Frontend on Vercel** — with `VITE_API_URL` pointing at the API.
4. **Go back and set `CLIENT_URL`** on the API to the Vercel domain, so CORS and
   cookies work. This step is easy to forget and everything looks broken without it.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access** → add a user with a password. This is *not* your Atlas
   login — it is a database user.
3. **Network Access** → add an IP. Render's egress IPs are not fixed on the free
   tier, so `0.0.0.0/0` is the practical choice for a demo. It is not acceptable
   for production; there you would use a fixed egress IP or VPC peering.
4. **Connect → Drivers → Node.js** and copy the string:

   ```
   mongodb+srv://<user>:<password>@<cluster>.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

5. Insert the database name before the `?`:

   ```
   mongodb+srv://appuser:s3cret@cluster0.ab12c.mongodb.net/whatsapp_clone?retryWrites=true&w=majority
   ```

If the password contains `@ : / # ?`, percent-encode it (`@` → `%40`) or the URI
will not parse.

**Seed it** (optional) by pointing your local `.env` at Atlas and running
`npm run seed`. Remember this **wipes** the collections first.

---

## 2. API on Render

The repository includes [`render.yaml`](../render.yaml), so Render can read the
whole service definition from the repo.

**Via the blueprint:** New → Blueprint → pick this repo. Render reads
`render.yaml`, creates the service, and generates the two JWT secrets for you.

**Manually:** New → Web Service → connect the repo, then:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm install` |
| Start command | `node backend/server.js` |
| Health check path | `/api/health` |

Set these environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `MONGO_URI` | the Atlas string from step 1 |
| `JWT_ACCESS_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | a **different** value from the same command |
| `CLIENT_URL` | fill in after step 3 |

You will get a URL like `https://chatapp-api.onrender.com`. Check it:

```bash
curl https://chatapp-api.onrender.com/api/health
# {"success":true,"status":"ok","uptime":12.3}
```

> **Free tier caveat:** Render sleeps a free service after 15 minutes idle, and
> the cold start takes 30–60 seconds. The first load after a quiet period looks
> broken but is not. Worth saying out loud if you demo this live.

### Other hosts

The [`Dockerfile`](../Dockerfile) works anywhere that runs containers:

```bash
# Railway
railway up

# Fly.io
fly launch --now
fly secrets set MONGO_URI="..." JWT_ACCESS_SECRET="..." JWT_REFRESH_SECRET="..." CLIENT_URL="..."
```

---

## 3. Frontend on Vercel

From the repo root:

```bash
cd frontend
vercel --prod
```

Or connect the repo in the Vercel dashboard with **Root Directory** set to
`frontend`. [`frontend/vercel.json`](../frontend/vercel.json) already sets the
framework, the SPA rewrite and cache headers.

Set one environment variable in **Project Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://chatapp-api.onrender.com` — no trailing slash |

**`VITE_*` variables are baked in at build time, not read at runtime.** Changing
one requires a redeploy; setting it after the fact does nothing until you
rebuild. This is the single most common Vite deployment mistake.

---

## 4. Close the loop — set `CLIENT_URL`

Go back to Render and set:

```
CLIENT_URL=https://your-app.vercel.app
```

Multiple origins are supported, comma-separated:

```
CLIENT_URL=https://your-app.vercel.app,https://chatapp.yourdomain.com
```

The server also allows any `https://<something>.vercel.app` origin so preview
deploys work without reconfiguration — see the `origin` callback in
[`backend/server.js`](../backend/server.js).

Without this, every API call fails CORS and the app appears completely dead.

---

## How cross-domain cookies work here

Once the app and the API are on different domains, the refresh cookie is a
**third-party cookie**, which browsers restrict. Three things must all be true:

| Requirement | Where it is handled |
|---|---|
| `SameSite=None; Secure` on the cookie | `backend/utils/tokens.js` — set when `NODE_ENV=production` |
| `credentials: true` on both ends | `cors()` in `server.js`, `withCredentials` in `api/client.js` |
| An explicit origin, never `*` | the `origin` callback — `credentials: true` forbids a wildcard |

**Both sides must be HTTPS.** `Secure` cookies are dropped over plain HTTP, so
a mixed setup silently fails to keep anyone logged in.

> Safari and Brave block third-party cookies by default, so silent session
> restore can fail there even when everything is configured correctly. The fix is
> to put the app and the API on the same site — `app.example.com` and
> `api.example.com` with `Domain=.example.com` — which is what a production
> deployment should do anyway.

---

## Environment variables, complete

### API

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | **yes** | Server refuses to boot without it |
| `JWT_ACCESS_SECRET` | **yes** | Long random string |
| `JWT_REFRESH_SECRET` | **yes** | Must differ from the access secret |
| `CLIENT_URL` | yes in prod | Comma-separated origin allow-list |
| `NODE_ENV` | yes in prod | `production` enables secure cookies, hides stack traces |
| `PORT` | no | Most hosts inject this |
| `ACCESS_TOKEN_TTL` | no | Default `15m` |
| `REFRESH_TOKEN_TTL` | no | Default `7d` |

### Frontend

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | yes in prod | API origin, no trailing slash. Empty locally so the dev proxy is used |

---

## Post-deploy checklist

```bash
API=https://chatapp-api.onrender.com
APP=https://your-app.vercel.app

# 1. API is alive
curl $API/api/health

# 2. CORS allows the app origin
curl -sI -H "Origin: $APP" $API/api/health | grep -i access-control-allow-origin

# 3. CORS rejects a stranger — this should print nothing
curl -sI -H "Origin: https://evil.example.com" $API/api/health | grep -i access-control-allow-origin

# 4. Register works end to end and sets the refresh cookie
curl -si -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -H "Origin: $APP" \
  -d '{"name":"Test User","username":"testuser","email":"t@example.com","password":"Password123"}' \
  | grep -Ei "HTTP/|set-cookie"
```

Then in the browser, with devtools open:

- [ ] The app loads and the login screen renders
- [ ] Register or log in succeeds
- [ ] **Network tab:** the `/api/auth/login` response carries `Set-Cookie`
- [ ] **Network tab:** `/socket.io/?EIO=4&transport=websocket` returns **101 Switching Protocols**
- [ ] A hard refresh keeps you logged in (silent refresh worked)
- [ ] Two browsers, two accounts: a message appears without a reload
- [ ] Typing in one shows the indicator in the other
- [ ] Closing one tab does not mark a two-tab user offline

Item 4 is the one that catches a bad deploy: a **200** instead of **101** means
the WebSocket upgrade was refused and the app has silently fallen back to
polling — or that you deployed the API somewhere that cannot hold a socket open.

---

## Troubleshooting

**Everything 403s / "blocked by CORS"**
`CLIENT_URL` on the API does not match the app's origin. Match it exactly —
scheme included, no trailing slash.

**Login works but a refresh logs me out**
The refresh cookie is not being stored or sent. Check the API is HTTPS, that
`NODE_ENV=production` (so `Secure` and `SameSite=None` are set), and that the
browser is not blocking third-party cookies.

**Realtime does nothing, but REST works**
The WebSocket upgrade is failing. Check the Network tab for `101`. If the API is
on Vercel, this is the platform limit described at the top — move it.

**`VITE_API_URL` is set but the app still calls the wrong host**
It is compiled in at build time. Redeploy after changing it.

**`ServerSelectionTimeoutError` in the API logs**
Atlas is rejecting the connection. Almost always Network Access: add the host's
IP, or `0.0.0.0/0` for a demo.

**First request after idle takes a minute**
Render free-tier cold start. Expected; upgrade the plan or accept it.

**`Transaction numbers are only allowed on a replica set member`**
The API is pointed at a standalone `mongod`. Atlas is a replica set, so this
should not appear in a correct deployment — check `MONGO_URI`.

---

## What is missing for a real production deployment

Worth being able to list, because an interviewer will ask what "production"
means beyond "it is deployed":

- **No CI/CD gate.** Nothing runs tests before a deploy, because there are no
  automated tests yet.
- **Single region, single instance.** No horizontal scaling — the in-process
  presence map prevents it until Redis is added. See
  [ARCHITECTURE.md §12](ARCHITECTURE.md#12-scaling-beyond-one-process).
- **No observability.** No structured logging, metrics, tracing or alerting.
- **No secret rotation.** Rotating the JWT secrets invalidates every session at
  once, because refresh tokens are stateless.
- **No backups tested.** Atlas snapshots exist on paid tiers; a backup you have
  never restored is not a backup.
- **`0.0.0.0/0` on Atlas.** Acceptable for a demo, not for real data.
