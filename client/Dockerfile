FROM node:24-alpine AS dependencies

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

FROM dependencies AS development

COPY client/ ./
COPY shared/ /app/shared/

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM dependencies AS builder

COPY client/ ./
COPY shared/ /app/shared/

ARG VITE_BASE_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_BASE_URL=$VITE_BASE_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:1.27-alpine AS production

RUN apk add --no-cache openssl

COPY client/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY client/nginx/05-ensure-tls.sh /docker-entrypoint.d/05-ensure-tls.sh
COPY --from=builder /app/client/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/05-ensure-tls.sh

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
