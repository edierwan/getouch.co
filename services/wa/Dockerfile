FROM node:22-alpine
WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

# Auth data persisted via Docker volume at /app/data
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.mjs"]