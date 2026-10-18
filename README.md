# Jappan

Jappan is a Discord bot made to make life easier through music playback, fun commands, moderation, leveling, audit logging, playlists, and server administration features.

## Links

- [Try Jappan in REKT Gaming](https://discord.gg/3mRbVCjvmz)
- [Invite Jappan to your server](https://discord.com/api/oauth2/authorize?client_id=732230135671029831&permissions=8&scope=applications.commands%20bot)
- [Jappan website](https://jappan.febkosq8.me/)
- [Report a bug or suggest an improvement](https://github.com/febkosq8/Jappan/issues)

## Features

- Music playback with search, playlists, queue controls, looping, shuffling, and player diagnostics
- Fun commands and soundboard playback
- Leveling from messages, interactions, and voice activity
- Moderation tools including warnings and message cleanup
- Audit logging for server activity and Discord entities
- Voice-channel region locking
- Member join and leave announcements
- Guild administration, command deployment, and bot management tools

## Stack

- Runtime: [Node.js](https://nodejs.org/)
- Language: TypeScript with strict mode and NodeNext modules
- Discord framework: [discord.js](https://discord.js.org/)
- Music framework: [Discord Player](https://discord-player.js.org/)
- Database: MongoDB with [Mongoose](https://mongoosejs.com/)
- Package manager: [pnpm](https://pnpm.io/)

## Configuration

Copy [`.env.example`](./.env.example) to `.env` and set the required values:

- `DISCORD_TOKEN`: your Discord bot token
- `DB_URL`: your MongoDB connection string

Review `.env.example` for the optional settings.

## Running Jappan

Choose one of the two options below. Both need the `.env` file from [Configuration](#configuration).

### Option 1: Docker

The image is published to [GitHub Container Registry](https://github.com/febkosq8/Jappan/pkgs/container/jappan). You only need Docker Compose, [docker-compose.yaml](./docker-compose.yaml), and the `.env` file in the same folder. No clone, Node.js, or pnpm is needed; Compose pulls the published image.

1. Put `docker-compose.yaml` and `.env` in the same folder. `DB_URL` must point to a MongoDB server reachable from the container; `localhost` inside the container is not your host machine.
2. Create the log file before the first run, otherwise Docker creates a directory with that name:

    ```text
    mkdir -p logs && touch logs/docker.log
    ```

    The container's `node` user must be able to write to it.

3. Start the bot:

    ```text
    docker compose up -d
    ```

Compose restarts the bot unless it is stopped and publishes the configured `PORT` (3030 by default).

```text
docker compose pull      # Fetch the latest image
docker compose logs -f   # Follow logs
docker compose down      # Stop the bot
```

Console output is also appended to `logs/docker.log` next to `docker-compose.yaml`.

### Option 2: Clone and run with PM2

Runs Jappan from source without Docker. Requires Node.js, pnpm, ffmpeg, and a reachable MongoDB server.

1. Clone the repository and install dependencies:

    ```text
    git clone https://github.com/febkosq8/Jappan.git
    cd Jappan
    pnpm install
    ```

2. Create `.env` as described in [Configuration](#configuration).
3. Build the bot:

    ```text
    pnpm run build
    ```

4. Install PM2 and start the bot with the included [ecosystem.config.cjs](./ecosystem.config.cjs):

    ```text
    npm install -g pm2
    pm2 start ecosystem.config.cjs
    ```

PM2 restarts the bot if it crashes and writes combined output to `logs/pm2.log`.

```text
pm2 logs Jappan      # Follow logs
pm2 restart Jappan   # Restart after rebuilding
pm2 stop Jappan      # Stop the bot
pm2 save             # Save the process list
pm2 startup          # Start PM2 on system boot
```

## Development

Install pnpm and the required Node.js runtime, run `pnpm install`, and create `.env` as described in [Configuration](#configuration).

```text
pnpm run dev           # Start the development watcher
pnpm run typecheck     # Check TypeScript without emitting files
pnpm run build         # Build the production bundle
pnpm start             # Start the production bundle
pnpm run format        # Format TypeScript files
pnpm run format:check  # Check TypeScript formatting
```

There is currently no automated test script. Use typecheck, build, and focused manual verification when validating changes.

## Migration

The v1-to-v2 migration is a one-time, environment-dependent operation:

```text
pnpm run migrate:v1tov2 -- <v1-db-url> <v2-db-url>
```

The migration clears the v2 destination database after a 10-second cancellation window. Create a backup of the destination database before running it. Press `Ctrl+C` during the cancellation window to stop the migration.

## Project Structure

- `src/index.ts` and `src/bot.ts`: application bootstrap and lifecycle
- `src/commands/`: global slash commands
- `src/commands/guildCommands/`: guild-scoped slash commands
- `src/buttons/`: button interaction implementations
- `src/handlers/`: Discord event and interaction adapters
- `src/services/`: feature behavior, persistence coordination, loaders, and configuration
- `src/models/`: Mongoose models and schemas
- `src/helpers/`: shared utilities and formatting helpers

Handlers and command entry points should remain thin. Business rules and persistence operations belong in services.

## Documentation

- [discord.js documentation](https://discord.js.org/docs/packages/discord.js/main)
- [Discord.js guide](https://discordjs.guide/)
- [Discord Player documentation](https://discord-player.js.org/)
- [Mongoose documentation](https://mongoosejs.com/docs/)
- [pnpm documentation](https://pnpm.io/)
