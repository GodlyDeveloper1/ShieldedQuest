# The Shielded Quest web app. Build from the repository root, because the app
# uses the quest-crypto library next to it:
#
#   docker build -f quest-web/Dockerfile .
#
# (docker compose does this for you.)

FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY quest-crypto/package.json quest-crypto/package-lock.json quest-crypto/
RUN cd quest-crypto && npm ci
COPY quest-web/package.json quest-web/package-lock.json quest-web/
RUN cd quest-web && npm ci
COPY quest-crypto quest-crypto
COPY quest-web quest-web
RUN cd quest-web && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Published hunts and encrypted clue media live in /data: mount a volume there.
ENV QUEST_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/quest-web
VOLUME /data
EXPOSE 3000
# Listens on every interface inside the container; docker-compose.yml decides
# what, if anything, is published outside it.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
