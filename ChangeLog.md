## v1.4.3

- discord.js, @discord-player, etc version bump
- Prefix commands only gets triggered after a pre check
- Added GetChannel admin command to fetch a channel using guild id and channel id
- Audit logger now converts the object to string the event while saving to db
- GuildList admin command now sends the embed(s) in pairs of 20 servers and also includes the timestamp of join and the owner user id
- Remove all reference to user discriminators
- Doppelganger now takes your globalName instead of nickname
- AuditHandler now includes try catch blocks to avoid random uncaught exceptions
- AuditHandler now skips events that was triggered by the bot itself
- Play command now truncates the autocomplete item name(s) if more than 100 characters
- Added listener for unhandledRejection
- MongoDB disconnection event now waits 10 seconds to propagate. This handles the case where the MongoDB instance was switching to a new cluster

#

## v1.4.2

- discord.js, @discord-player, etc version bump
- discord.js, @discord-player, etc version bump
- Switched to useMainPlayer from UseMasterPlayer for discord-player
- Switched to mediaplex from opusscript
- We no longer send the error stack interaction fail event
- AdminGuildList now also checks if bot has Admin role
- Removed ffmpeg from npm and changed it to docker
- Fixed AuditHandler throwing error when missing some data
- Play autocomplete now truncates the response if over 100 characters

#

### v1.4.1

- Dockerize the bot to fix song skipping issue when hosted on heroku
- discord.js, @discord-player, etc version bump
- Better Error handling for all music commands
- Better logic for checking if a prefixMessage actually contains a argument
- Now checking if the Bot has Admin Permissions in Admin ListGuild command
- Discord Player loads the extractors automatically (Reverted the last change)

#

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
