FROM node:24-alpine AS builder

WORKDIR /app/server

COPY server/package*.json ./


RUN npm ci

COPY server/ ./

COPY shared/ /app/shared/

RUN npm run build

FROM builder AS test

RUN npm test

FROM node:24-alpine AS production

WORKDIR /app/server


COPY server/package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/seed-assets ./seed-assets

USER node

EXPOSE 5000

CMD ["node", "dist/server/src/index.js"]


FROM builder AS development

EXPOSE 5000

CMD ["npm", "start"]
