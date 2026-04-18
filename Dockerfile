FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY core ./core
COPY adapters ./adapters
COPY public ./public
COPY bot-server.js ./bot-server.js
COPY slack-bot.js ./slack-bot.js

ENV NODE_ENV=production
ENV BOT_SERVER_PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["node", "bot-server.js"]
