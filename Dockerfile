# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Runtime
FROM node:20-alpine AS runtime

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

COPY --from=build /usr/src/app/dist ./dist

# Create writeable tmp directory and run as non-root node user
RUN mkdir -p /tmp/app && chown -R node:node /tmp/app

USER node

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
