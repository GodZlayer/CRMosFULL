FROM node:24-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_ROOT=/app/dist \
    CRM_STORAGE_ROOT=/app/server/storage
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
RUN mkdir -p /app/scripts
COPY server ./server
COPY scripts/text-repair.mjs ./scripts/text-repair.mjs
COPY public ./public

RUN mkdir -p /app/server/storage/database /app/server/storage/uploads \
    && chown -R node:node /app

USER node
EXPOSE 3000
VOLUME ["/app/server/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
