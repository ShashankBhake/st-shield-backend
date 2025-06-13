# Use Node.js 18 LTS as base image
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files and lockfile
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install latest pnpm globally
RUN npm install -g pnpm@latest

# Install all dependencies
RUN pnpm install

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 nodejs

# Set working directory
WORKDIR /app

# Copy package files and lockfile
COPY --from=base /app/package*.json ./
COPY --from=base /app/pnpm-lock.yaml ./

# Install pnpm and production dependencies
RUN npm install -g pnpm@latest
RUN pnpm install --prod --shamefully-hoist

# Copy application code
COPY --from=base /app/backend ./backend

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1)).end()"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application using npm start
CMD ["npm", "start"]