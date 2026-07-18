# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Runtime
FROM node:22-alpine AS runtime

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

COPY --from=build /usr/src/app/dist ./dist

# Create writeable tmp and data directories for read-only root compatibility
RUN mkdir -p /tmp/app /usr/src/app/.data && \
    chown -R node:node /tmp/app /usr/src/app/.data

USER node

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV SESSION_REGISTRY_PATH=/usr/src/app/.data/sessions.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/controller/server.js"]
