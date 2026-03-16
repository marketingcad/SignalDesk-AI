FROM node:20-slim

WORKDIR /app

# Install dependencies (include dev for building TypeScript)
COPY package.json package-lock.json ./
RUN npm ci

# Install Playwright Chromium + ALL system dependencies
RUN npx playwright install --with-deps chromium

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
