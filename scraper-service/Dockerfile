FROM node:20-slim

# Install Playwright system dependencies (Chromium)
RUN npx playwright install-deps chromium

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install Playwright browsers
RUN npx playwright install chromium

# Copy built output and required files
COPY dist/ ./dist/
COPY storage/ ./storage/

EXPOSE 4000

CMD ["node", "dist/index.js"]
