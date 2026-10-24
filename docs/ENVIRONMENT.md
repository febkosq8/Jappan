# Environment variables

Copy [`.env.example`](../.env.example) to `.env`. Only `DISCORD_TOKEN` and `DB_URL` are required by the application; the remaining settings have defaults or are used only for optional features. Port settings default to `8875`.

| Variable                                            | Description                                                                                                        | Required? | Possible values                                     | Default                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------- | -------------------------------------------------------- |
| `DISCORD_TOKEN`                                     | Discord bot token used to log in.                                                                                  | Yes       | Non-empty bot token                                 | None; must be set                                        |
| `DB_URL`                                            | Connection string for the MongoDB database.                                                                        | Yes       | MongoDB connection URI                              | None; must be set                                        |
| `PORT`                                              | Port the application listens on.                                                                                   | No        | Available port                                      | `8875`                                                   |
| `HOST_PORT`                                         | Host-side port published by Docker Compose. It must be unused on the host.                                         | No        | Available port                                      | `8875`                                                   |
| `BOT_NAME`                                          | Fallback name used before login; replaced with the logged-in Discord bot's username when the client is ready.      | No        | Text                                                | `Jappan`                                                 |
| `BOT_PFP`                                           | Fallback profile image; replaced with the logged-in Discord bot's avatar when the client is ready.                 | No        | Image URL                                           | `https://jappan.febkosq8.me/assets/Profile-FDHZtz5Q.png` |
| `BOT_WEBSITE`                                       | Website URL shown in bot links and embeds.                                                                         | No        | URL                                                 | `https://jappan.febkosq8.me`                             |
| `BACKEND_URL`                                       | Backend API base URL. Trailing slashes are removed.                                                                | No        | URL                                                 | `https://api-jappan.febkosq8.me`                         |
| `ALLOWED_ORIGINS`                                   | Origins allowed to make cross-origin API requests. Separate multiple origins with semicolons.                      | No        | Semicolon-separated origin URLs                     | http://localhost:3000;https://jappan.febkosq8.me         |
| `ADMIN_USER_IDS`                                    | IDs to treat as administrator accounts. Leave empty for no configured IDs.                                         | No        | Semicolon-separated Discord user IDs                | Empty                                                    |
| `LOG_TIMESTAMP`                                     | Adds timestamps to log output only when set to `true`.                                                             | No        | Exact string `true` or `false`                      | `false`                                                  |
| `PLAYER_DEBUG`                                      | Enables Discord Player debug logging only when set to `true`.                                                      | No        | Exact string `true` or `false`                      | `false`                                                  |
| `PLAYER_HEALTH_DEBUG`                               | Enables detailed player health-check logging only when set to `true`.                                              | No        | Exact string `true` or `false`                      | `false`                                                  |
| `ENABLE_EVENTS_DEBUG`                               | Registers debug listeners for selected Discord events. Supported names and patterns are listed below.              | No        | `false` or semicolon-separated event names/patterns | `false`                                                  |
| `PLAYER_HEALTH_CHECK_QUERY`                         | Query used to check that player search works.                                                                      | No        | Discord Player search query                         | `https://www.youtube.com/watch?v=dQw4w9WgXcQ`            |
| `PLAYER_HEALTH_CHECK_MAX_ATTEMPTS`                  | Maximum search attempts. `0` skips the search check.                                                               | No        | Non-negative integer                                | `3`                                                      |
| `PLAYER_HEALTH_CHECK_PLAYBACK_MS_TIMEOUT`           | Maximum playback startup wait, in milliseconds.                                                                    | No        | Integer of at least `1000`                          | `10000`                                                  |
| `PLAYER_HEALTH_CHECK_PLAYBACK_STABILITY_MS_TIMEOUT` | Playback stability-check duration, in milliseconds.                                                                | No        | Integer of at least `1000`                          | `5000`                                                   |
| `PLAYER_HEALTH_CHECK_GUILD_ID`                      | Optional guild for the playback health check. Configure this together with `PLAYER_HEALTH_CHECK_CHANNEL_ID`.       | No        | Discord guild ID                                    | Unset                                                    |
| `PLAYER_HEALTH_CHECK_CHANNEL_ID`                    | Optional voice channel for the playback health check. Configure this together with `PLAYER_HEALTH_CHECK_GUILD_ID`. | No        | Discord voice-channel ID                            | Unset                                                    |
| `SHUTDOWN_THREASHOLD`                               | Number of uncaught exceptions or unhandled promise rejections before the process shuts down.                       | No        | Positive integer                                    | `3`                                                      |

Boolean settings are enabled only by the exact value `true`; other values are treated as disabled.

The previous playback timeout variable names without `MS` remain accepted for compatibility. Use the new names in `.env` files.

## `ENABLE_EVENTS_DEBUG` values

Event names are case-sensitive. Separate multiple names or patterns with semicolons. Set the value to `false` to disable event debugging.

Supported event names:

`GuildMemberAdd`, `GuildMemberRemove`, `MessageCreate`, `InteractionCreate`, `VoiceStateUpdate`, `MessageDelete`, `MessageBulkDelete`, `MessageUpdate`, `InviteCreate`, `InviteDelete`, `GuildAuditLogEntryCreate`, `UserUpdate`, `GuildMemberUpdate`, `GuildBanAdd`, `GuildBanRemove`, `ChannelCreate`, `ChannelUpdate`, `ChannelDelete`, `GuildRoleCreate`, `GuildRoleUpdate`, `GuildRoleDelete`, `ThreadCreate`, `ThreadUpdate`, and `ThreadDelete`.

Patterns match all supported events (`*`), names beginning with a prefix (`Message*`), names ending with a suffix (`*Update`), or names containing text (`*Delete*`).

```env
ENABLE_EVENTS_DEBUG="GuildMemberAdd;Message*"
```
