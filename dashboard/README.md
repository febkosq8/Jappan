This internal repository is to develop and host the dashboard / website for Jappan

Signed-in administrators can open **Admin → List Guilds** to view stored guilds
and their available Discord details. The dashboard requests
`GET /api/v1/admin/guilds` using the session cookie; the API enforces admin access.
If the session cannot be checked or sign-in is required, the auth error page
returns to the requested admin page when a valid session becomes available.
Guild details also provide admin actions for sending a message to a selected text
channel and getting an invite through authenticated API endpoints.
Administrators can also confirm removal of the bot from a guild, optionally
adding a departure message and selecting a sendable channel. The bot still
leaves if sending fails or no sendable channel is available.
Message-send failures appear as notifications; missing bot channel permissions
are distinguished from a user's lack of admin access.
The message channel selector includes only text channels where the bot can view
the channel, send messages, and embed links. Refresh channels to update the list.
