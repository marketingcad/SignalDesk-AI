FROM node:20-slim

WORKDIR /app

# System packages:
#  - procps: 'ps' command required by Crawlee
#  - xvfb / x11vnc / novnc / websockify: the "Live Login" remote viewable browser
#    (runs a real non-headless Chromium on a virtual display, streamed to the
#    dashboard so the user can log in to social platforms interactively).
RUN apt-get update && apt-get install -y --no-install-recommends \
      procps \
      xvfb \
      x11vnc \
      novnc \
      websockify \
    && rm -rf /var/lib/apt/lists/*

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
