# UI only — serves React at /inventory/
# Browser calls API at https://api.katariastoneworld.com (set in REACT_APP_API_URL at build time)
#
# Railway: inventory repo → dockerfilePath = deploy/gateway/Dockerfile
# Custom domain: www.katariastoneworld.com

FROM node:20-alpine AS web-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY public ./public
COPY src ./src
COPY .env.production ./

ARG REACT_APP_API_URL=https://api.katariastoneworld.com
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV CI=false

RUN npm run build

RUN mkdir -p /out/inventory && cp -r build/* /out/inventory/

FROM node:20-alpine AS gateway

WORKDIR /gateway

COPY deploy/gateway/package.json deploy/gateway/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY deploy/gateway/server.js ./
COPY --from=web-build /out ./public

ENV NODE_ENV=production

CMD ["node", "server.js"]
