# syntax=docker/dockerfile:1
FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,target=/run/proxy-ca.pem \
    if [ -f /run/proxy-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem; fi; \
    npm ci --no-audit --no-fund && npm cache clean --force
COPY . .
CMD ["node", "server.js"]
