# ==========================================
# Stage 1: Build Vue 3 Frontend
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app

# Install frontend dependencies
COPY package*.json ./
RUN npm ci || npm install

# Build frontend production bundle
COPY . .
RUN npm run build

# ==========================================
# Stage 2: Production Runtime (Node.js + FFmpeg)
# ==========================================
FROM node:18-alpine
LABEL org.opencontainers.image.source="https://github.com/Mercu7io/RedPandaiumCast"
LABEL org.opencontainers.image.description="RedPandaium Cast - Media Player with AI Subtitles"

# Install FFmpeg for backend audio extraction
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install backend production dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy backend application source
COPY backend/ ./

# Copy compiled frontend assets from Stage 1 into public/
COPY --from=frontend-builder /app/dist ./public

# Environment and Ports
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
