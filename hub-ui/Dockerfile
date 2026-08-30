# syntax=docker/dockerfile:1
# Tiny dashboard: no deps, no build step — node serves static files + JSON API.
FROM node:22-slim
WORKDIR /app
COPY server.js config.json ./
COPY public/ public/
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node", "server.js"]
