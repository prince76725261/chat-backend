# Portable alternative to render.yaml — works on Fly.io, Railway, Cloud Run,
# or any container host. Vercel is deliberately not a target: its functions
# cannot hold a WebSocket open.
FROM node:22-alpine

WORKDIR /app

# Copy manifests first so the dependency layer is cached across code changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY backend ./backend

ENV NODE_ENV=production
EXPOSE 5000

# Run unprivileged.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
