FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs db.mjs baileys-db.mjs ui.mjs session-manager.mjs webhook-dispatcher.mjs ./

# Auth data persisted via Docker volume at /app/data
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.mjs"]