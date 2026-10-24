FROM node:24.22.1-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json extractorpack.config.mjs ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm prune --prod

FROM node:24.22.1-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/febkosq8/Jappan" \
	org.opencontainers.image.description="Jappan is a Discord bot made to make life easier through music playback, fun commands, moderation, leveling, audit logging, playlists, and server administration features." \
	org.opencontainers.image.licenses="CC-BY-NC-4.0"

WORKDIR /app

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes ffmpeg \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/extractorpack.config.mjs ./extractorpack.config.mjs
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
