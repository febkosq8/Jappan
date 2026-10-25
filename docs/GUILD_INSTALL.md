# Guild Installation

The invite requests the permissions below to support Jappan's current features. It does not grant Administrator.

| #   | Permission            | Used for                                                               |
| --- | --------------------- | ---------------------------------------------------------------------- |
| 1   | View Channels         | Accessing channels where the bot responds or performs configured tasks |
| 2   | Send Messages         | Sending command responses, announcements, and notifications            |
| 3   | Embed Links           | Sending command responses that contain embeds                          |
| 4   | Read Message History  | Reading messages for the cleanup command                               |
| 5   | Manage Messages       | Deleting messages with the cleanup command                             |
| 6   | Connect               | Joining voice channels for music and soundboard playback               |
| 7   | Speak                 | Playing audio in voice channels                                        |
| 8   | View Audit Log        | Reading server audit events when audit logging is enabled              |
| 9   | Manage Webhooks       | Creating webhooks for the doppelganger command                         |
| 10  | Manage Channels       | Changing voice-channel regions for configured region locks             |
| 11  | Manage Roles          | Assigning optional leveling reward roles                               |
| 12  | Create Instant Invite | Creating a server invite with the bot's admin command                  |

Some permissions are only used by optional features. Channel-specific permission overrides can further restrict what the bot can do.

The bot also requests the privileged **Server Members**, **Server Presences**, and **Message Content** intents. Enable these separately in the Discord Developer Portal; they are not invite permissions.
