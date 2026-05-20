FROM node:20-bookworm-slim

# wget and ca-certificates are required by playwright install --with-deps
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Skip the postinstall playwright download — we handle it below with --with-deps
# so we get the Chromium binary AND all required system libs in one step
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
