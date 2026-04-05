# Stage 1: Build client
FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY client/ client/
COPY server/ server/
RUN npm run build

# Stage 2: Production runtime
FROM node:22-slim

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace=server && npm cache clean --force

COPY --from=build /app/client/dist/ client/dist/
COPY server/src/ server/src/
COPY bin/ bin/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "bin/cli.js"]
