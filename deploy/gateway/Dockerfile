# Kataria public gateway: React inventory UI + reverse proxy to Spring Boot API.
#
# Railway: connect this repo, set dockerfilePath = deploy/gateway/Dockerfile
# Custom domain: www.katariastoneworld.com → this service
#
# Build context: repository root (kataristoneworldinventory)

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

# CRA homepage=/inventory → static files must live under html/inventory/
RUN mkdir -p /out/inventory && cp -r build/* /out/inventory/

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext wget

COPY deploy/gateway/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/gateway/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=web-build /out /usr/share/nginx/html

ENV PORT=8080
# Proxied to Spring Boot API (override in Railway Variables if needed)
ENV BACKEND_URL=https://api.katariastoneworld.com

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD sh -c 'wget -qO- "http://127.0.0.1:${PORT:-8080}/health" || exit 1'

ENTRYPOINT ["/docker-entrypoint.sh"]
