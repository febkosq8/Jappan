## v1.4.1

- Dockerize the bot to fix song skipping issue when hosted on heroku
- discord.js, @discord-player, etc version bump
- Better Error handling for all music commands
- Better logic for checking if a prefixMessage actually contains a argument
- Now checking if the Bot has Admin Permissions in Admin ListGuild command
- Discord Player loads the extractors automatically (Reverted the last change)

### v1.4.0

- discord.js, @discord-player version bump
- Better Error handling
- Better handling for event GuildAuditEntryCreate from AuditHandler
- Discord Player loads the extractors manually

#

## v1.3.9

- discord.js, @discordjs/voice version bump
- /nowPlaying now includes thumbnails
- Added command for toggling PlayerDebugState
- Moved GuildPlay to PlayerHandler
- Adding (missing) NOTICE handling to EventHandler
- Covering event GuildAuditEntryCreate from AuditHandler

#

## v1.3.8

- discord-player, equalizer & extractor version bump
- Switched to discord-player usePlayer()
- Added ffmpeg-static to fix early track end bug

#

## v1.3.7

- Added requestedBy in /nowplaying
- Fixed `undefined` in auditLog when a deleted role is updated in GuildMember
- Added /warn command with documentation

#
