This internal repository is to develop and host the dashboard / website for Jappan

Signed-in administrators can open **Admin → List Guilds** to view stored guilds
and their available Discord details. The dashboard requests
`GET /api/v1/admin/guilds` using the session cookie; the API enforces admin access.
Guild details also provide admin actions for sending a message to a selected text
channel and getting an invite through authenticated API endpoints.
