# Production deployment package. See docs/DEPLOYMENT.md before building.
# Official multi-platform Node image digest verified from Docker Hub on 2026-10-23.
FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS dependencies

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Match package.json; keep dev dependencies because the worker runs through tsx.
RUN npm install --global pnpm@9.15.9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

FROM dependencies AS build

# This is an operator attestation, not a licence validator. Public hosting is
# blocked until actual rights and a suitable licence key have been obtained.
# The AG key is intentionally public and gets embedded in the browser bundle.
# Never add server API keys, database URLs, or receipt keys as build arguments.
ARG DOORWAY_PUBLIC_HOSTING_APPROVED=false
ARG NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY
RUN if [ "$DOORWAY_PUBLIC_HOSTING_APPROVED" != "true" ] || [ -z "$NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY" ]; then \
      printf '%s\n' 'Hosting gate: obtain AG Studio public-hosting rights through the judging window, supply the actual licence key, and explicitly set DOORWAY_PUBLIC_HOSTING_APPROVED=true. Local evaluation alone is insufficient.' >&2; \
      exit 1; \
    fi
ENV NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY=$NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY

COPY next.config.ts tsconfig.json next-env.d.ts ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm build

FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/tsconfig.json /app/next-env.d.ts ./
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts

USER node
EXPOSE 10000
STOPSIGNAL SIGTERM

# Render configures the web-only /api/status health probe. Do not put an HTTP
# HEALTHCHECK on this shared image: its worker command serves no HTTP endpoint.
# Bypass package.json's loopback-only start script and honor the runtime PORT.
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
