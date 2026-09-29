FROM node:24.12.0-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json extractorpack.config.mjs ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm prune --prod

FROM node:24.12.0-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes ffmpeg \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
