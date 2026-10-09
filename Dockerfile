# ---- Builder ------------------------------------------------------------
# Full toolchain and devDependencies: compiles bcrypt's native bindings and
# runs the TypeScript build. Also the stage docker-compose.yml targets for
# local development, since tsx lives in devDependencies.
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/

# `npm ci` installs exactly what the lockfile pins — `npm install` could
# silently resolve different versions than were tested.
RUN npm ci --workspace apps/backend --include-workspace-root

COPY apps/backend ./apps/backend
RUN npm run build --workspace apps/backend

# ---- Production dependencies -------------------------------------------
# A separate install with devDependencies omitted, so the runtime image
# carries neither the toolchain nor the test/build tooling.
FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/

RUN npm ci --workspace apps/backend --include-workspace-root --omit=dev

# ---- Runtime ------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Never run the API as root.
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /app/package.json ./package.json
COPY --from=prod-deps --chown=app:app /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder --chown=app:app /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder --chown=app:app /app/apps/backend/dist ./apps/backend/dist

USER app

EXPOSE 3000

# Readiness (not liveness) — this reports 503 when Postgres or Redis is
# unreachable, so an instance that can't serve traffic is taken out of
# rotation instead of being handed requests.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# The API. Override to `npm run worker --workspace apps/backend` for the
# price-check worker — same image, different entrypoint.
CMD ["npm", "start", "--workspace", "apps/backend"]
