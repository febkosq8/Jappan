# Jappan

Jappan is a TypeScript Discord bot made to make life easier through music playback, fun commands, moderation, leveling, audit logging, playlists, and server administration features.

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

## Technical Bits

### Stack

- Runtime: [Node.js](https://nodejs.org/)
- Language: TypeScript with strict mode and NodeNext modules
- Discord framework: [discord.js](https://discord.js.org/)
- Music framework: [Discord Player](https://discord-player.js.org/)
- Database: MongoDB with [Mongoose](https://mongoosejs.com/)
- Package manager: [pnpm](https://pnpm.io/)

### Setup

1. Install pnpm and the required Node.js runtime.
2. Install dependencies:

    ```text
    pnpm install
    ```

3. Copy `.env.example` to `.env`.
4. Set the required `DISCORD_TOKEN` and `DB_URL` values. Review `.env.example` for optional settings.

### Commands

```text
pnpm run dev           # Start the development watcher
pnpm run typecheck     # Check TypeScript without emitting files
pnpm run build         # Build the production bundle
pnpm start             # Start the production bundle
pnpm run format        # Format TypeScript files
pnpm run format:check  # Check TypeScript formatting
```

There is currently no automated test script. Use typecheck, build, and focused manual verification when validating changes.

### Migration

The v1-to-v2 migration is a one-time, environment-dependent operation:

```text
pnpm run migrate:v1tov2 -- <v1-db-url> <v2-db-url>
```

The migration clears the v2 destination database after a 10-second cancellation window. Create a backup of the destination database before running it. Press `Ctrl+C` during the cancellation window to stop the migration.

### Project Structure

- `src/index.ts` and `src/bot.ts`: application bootstrap and lifecycle
- `src/commands/`: global slash commands
- `src/commands/guildCommands/`: guild-scoped slash commands
- `src/buttons/`: button interaction implementations
- `src/handlers/`: Discord event and interaction adapters
- `src/services/`: feature behavior, persistence coordination, loaders, and configuration
- `src/models/`: Mongoose models and schemas
- `src/helpers/`: shared utilities and formatting helpers

Handlers and command entry points should remain thin. Business rules and persistence operations belong in services.

### Documentation

- [discord.js documentation](https://discord.js.org/docs/packages/discord.js/main)
- [Discord.js guide](https://discordjs.guide/)
- [Discord Player documentation](https://discord-player.js.org/)
- [Mongoose documentation](https://mongoosejs.com/docs/)
- [pnpm documentation](https://pnpm.io/)
