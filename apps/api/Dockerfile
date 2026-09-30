# Stage 1: build the API from the complete workspace lockfile.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
# The specs are declared as build assets in apps/api/nest-cli.json. Assert they
# landed in dist here so a packaging regression fails the image build instead of
# shipping an image whose /sdkgen/generate 404s.
RUN npm run build --workspace=@savitools/api \
    && test -s apps/api/dist/modules/sdkgen/specs/fluxa.json \
    && test -s apps/api/dist/modules/sdkgen/specs/crowdpay.json

# Stage 2: install only locked API production dependencies.
FROM node:20-alpine AS runner

RUN apk add --no-cache git

WORKDIR /app
ENV NODE_ENV=production API_PORT=3001 API_PREFIX=api

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace=@savitools/api --include-workspace-root=false \
    && npm cache clean --force

# dist already carries modules/sdkgen/specs: nest-cli.json lists them as build
# assets (asserted in the builder stage), and SdkgenService reads them relative
# to its compiled module.
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY apps/api/docker-healthcheck.mjs docker-healthcheck.mjs

RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -s /bin/sh -D nestjs
USER nestjs

WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "/app/docker-healthcheck.mjs"]

CMD ["node", "dist/main.js"]
