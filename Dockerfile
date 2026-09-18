# syntax=docker/dockerfile:1

# ---- build: needs devDependencies for tsc ----
# Pinned to BUILDPLATFORM: tsc emits JavaScript, so running it under QEMU for a
# foreign architecture buys nothing and costs enormously -- the first multi-arch
# run of this image spent over 90 minutes emulating arm64 before this.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts because the `prepare` script runs tsc, which is not installed
# until this very step finishes.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- deps: production dependencies only ----
# Also BUILDPLATFORM. Safe because every production dependency here is pure
# JavaScript: the only packages in the lockfile carrying os/cpu constraints
# (esbuild, fsevents) are devDependencies of the toolchain, which never reach
# this stage. Add a dependency with a native binding and this has to change.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---- runtime: the only stage that is actually per-architecture ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
# The API index the search_api/describe_api/call_api tools read. Resolved
# relative to build/, so it has to travel with it.
COPY data ./data

# The `node` user ships with the image as uid 1000.
USER node

EXPOSE 3000

# The connector authenticates every request from its own Authorization header,
# so no API token is baked into the image.
CMD ["node", "build/connector.js"]
