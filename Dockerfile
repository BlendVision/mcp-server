# syntax=docker/dockerfile:1

# ---- build: needs devDependencies for tsc ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts because the `prepare` script runs tsc, which is not installed
# until this very step finishes.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- deps: production dependencies only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

# The `node` user ships with the image as uid 1000.
USER node

EXPOSE 3000

# The connector authenticates every request from its own Authorization header,
# so no API token is baked into the image.
CMD ["node", "build/connector.js"]
