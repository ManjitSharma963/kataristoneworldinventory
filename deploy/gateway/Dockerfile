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
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

COPY --from=web-build /out /usr/share/nginx/html

# Hint for Railway port detection — app still listens on injected $PORT at runtime.
EXPOSE 8080

# Do NOT set PORT here — Railway injects PORT at runtime.
ENV BACKEND_URL=https://api.katariastoneworld.com

ENTRYPOINT ["sh", "/docker-entrypoint.sh"]
