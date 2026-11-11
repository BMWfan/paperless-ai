# syntax=docker/dockerfile:1
FROM node:22.22.0-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,target=/run/proxy-ca.pem \
    if [ -f /run/proxy-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem; fi; \
    npm_config_nodedir=/usr/local npm ci --no-audit --no-fund

FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
CMD ["node", "server.js"]
