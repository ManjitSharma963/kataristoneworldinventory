# Kataria public gateway: React inventory UI + Express reverse proxy to Spring Boot API.
#
# Railway: connect this repo, set dockerfilePath = deploy/gateway/Dockerfile
# Custom domain: www.katariastoneworld.com → this service

FROM node:20-alpine AS web-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY public ./public
COPY src ./src
COPY .env.production ./

ARG REACT_APP_API_URL=https://www.katariastoneworld.com
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV CI=true

RUN npm run build

RUN mkdir -p /out/inventory && cp -r build/* /out/inventory/

FROM node:20-alpine AS gateway

WORKDIR /gateway

COPY deploy/gateway/package.json deploy/gateway/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY deploy/gateway/server.js ./
COPY --from=web-build /out ./public

ENV BACKEND_URL=https://api.katariastoneworld.com
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
