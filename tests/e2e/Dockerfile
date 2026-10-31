# syntax=docker/dockerfile:1
FROM node:22.22.0-bookworm
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,target=/run/proxy-ca.pem \
    if [ -f /run/proxy-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem; fi; \
    npm ci --no-audit --no-fund
COPY . .
CMD ["node", "server.js"]
