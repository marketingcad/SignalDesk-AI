FROM node:20-slim

# Install Playwright system dependencies (Chromium)
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (include dev for building TypeScript)
COPY package.json package-lock.json ./
RUN npm ci

# Install Playwright Chromium
RUN npx playwright install chromium

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Copy storage defaults
COPY storage/ ./storage/

EXPOSE 4000

CMD ["node", "dist/index.js"]
