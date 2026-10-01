# KULT compute layer. Chromium is included for the browser playtest; fonts
# so screenshots render text like a real phone would.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PLAYTEST_BROWSER_PATH=/usr/bin/chromium \
    DATA_DIR=/var/data \
    PORT=4100

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /var/data

EXPOSE 4100
CMD ["node", "src/server.js"]
