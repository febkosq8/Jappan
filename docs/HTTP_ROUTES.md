# HTTP routes and OpenAPI

Routes are registered through `src/routes/index.ts` under `/api/v1`. The
generated specification is available at `/openapi.json` and Swagger UI at
`/swagger`; use these for the route inventory and request/response schemas.
This document records design decisions and behavior that is easy to miss.

## Route definitions

- `defineRouter` mounts entries in order, followed by any optional child routers.
  Router-level and route-level middleware run in order before handlers.
- OpenAPI metadata describes the wire format but does not validate requests or
  enforce security. Query parameters generally arrive as strings. Zod input
  schemas document requests; output schemas document responses.
- Path parameters must have matching required parameter definitions.
  Documented paths support literal segments and `:name` parameters, not
  wildcards or Express `all`. `excludeFromOpenApi` hides documentation only; it
  does not disable or secure a route.
- Response `schema` means JSON. Use `content` for other media types, and omit
  both for responses without bodies. Headers can use descriptions or Zod
  schemas. Express `sendStatus` can produce text except for bodyless statuses.
- `defineExternalRouter` mounts existing Express routers and can document
  externally handled operations without registering their handlers. Keep that
  metadata synchronized with the implementation.
- Route errors are logged and default to JSON 500. A route-specific error
  handler can override this before headers are sent; later errors are forwarded
  to Express. Router-wide middleware errors use the application error handler.
  Explicitly documented 500 responses must match actual behavior.
- Unknown security schemes, duplicate operations or parameters, unsupported
  paths, and missing path parameters fail specification generation explicitly;
  they do not prevent route registration.

## Authentication and availability

- Better Auth is mounted before body parsing. Only its session endpoint is
  documented in OpenAPI. Protected API routes accept either the Better Auth
  session cookie or a Bearer token from the `set-auth-token` response header.
  Swagger documents Bearer authentication; browser JavaScript cannot set a
  `Cookie` header, though an existing browser cookie is sent automatically.
  Session responses contain sensitive tokens.
- OpenAPI security schemes are documentation only. `requireSession` authenticates;
  protected routes must also enforce their own authorization. `requireAdmin`
  checks the active admin role. Guild routes allow admins or guild members with
  Manage Server permission; admins need not be guild members. Unexpected
  membership lookup failures are errors, not authorization denials.
- `requireDatabase` and `requireDiscord` are opt-in availability checks, not
  authorization or guarantees that a dependency remains connected. Documented
  middleware responses are merged into OpenAPI, including alternatives for
  shared status codes.
- The dashboard redirects 401 and 403 responses to the corresponding auth
  error pages. Session connectivity failures use `NETWORK_ERROR` and offer a
  manual retry plus automatic retries after 5 seconds, doubling the delay after
  each failed retry (10, 20, 40 seconds, and so on). Other session lookup failures
  use `SESSION_CHECK_FAILED` with manual retry only. Successful checks return to
  the requested page, preserving its query and hash, or prompt sign-in if the
  session has ended. Older `SESSION_UNAVAILABLE` links remain supported.
- Better Auth uses MongoDB directly; Mongoose models expose the same collections
  internally. Normal Mongoose projections exclude credentials, session tokens,
  and verification values, but aggregation and direct MongoDB queries bypass
  those projections. Auth indexes are created without dropping other indexes.
- Discord usernames are stored on the user and linked account; user `name` is
  the display name, falling back to the username. Existing accounts acquire a
  username on sign-in. Missing user status is treated as active. Blocking
  prevents new sessions but does not revoke existing ones. Roles are synced
  from `ADMIN_USER_IDS` at startup and sign-in; all instances sharing a
  database must use the same list. Users cannot edit their own status or role.

## Public commands and guild data

- Collection GET endpoints use the same paginated response: `{ items, pagination }`,
  where `pagination` contains `page`, `perPageLimit`, `total`, and `totalPages`.
  `page` defaults to 1; `perPageLimit` defaults to 25 and values 1-1000 bound
  each response. `perPageLimit=0` returns all matching results in one response
  and reports page 1. `totalPages` is 0 for an empty result. Invalid pagination,
  filter values, unsupported filter fields, or unknown list parameters return
  HTTP 400. `query` is a trimmed, case-insensitive substring search across the
  endpoint's searchable fields, including numeric and boolean values. Pass only
  the text to find, e.g. `?query=Febkosq8`.
- Use `filter[field]=value` for a case-insensitive substring search on one
  supported field, e.g. `/guilds/manager?filter[name]=Febkosq8`. A filter field
  overrides the global `query`; when several field filters are supplied, they
  combine with AND. For example,
  `/guilds/manager?filter[name]=Jappan&filter[owner.username]=Febkosq8` requires
  both matches. Filters use the endpoint's supported field names; nested fields
  use dot notation. Boolean filters accept `true` or `false`; numeric filters
  require numeric values. Unknown fields or invalid values return HTTP 400.
  Combine filters with pagination using `&`, e.g.
  `/guilds/manager?filter[name]=Jappan&perPageLimit=25`.
  Supported filter fields are endpoint-specific and are defined by each list's
  searchable data; this document does not enumerate them.
- The dashboard requests `perPageLimit=0` for lists displayed in client-side tables,
  returning them in one API call. Other clients can request bounded pages.
- Numeric bot, guild, channel, and invite timestamps use `*TimestampMs` field names
  and represent milliseconds since the Unix epoch. These replace the previous
  `createdAt`, `joinedTimestamp`, `discoveredAt`, `createdTimestamp`,
  `expiresTimestamp`, and `bootedAtMs` response fields. Better Auth uses its own ISO date fields.
- The public command listing contains global commands only. Subcommands share
  their parent's Discord ID and inherit declared permissions; IDs can be null
  before registration. Permission requirements are not a guarantee of
  availability in a particular guild or channel.
- The admin guild list includes stored guilds the bot has left. Membership
  includes temporarily unavailable guilds, but Discord-specific details may
  be omitted. Required-permission coverage is guild-level and does not account
  for channel overrides. Discord disconnection or unexpected detail lookup
  failures are errors rather than incomplete success responses.
- Service preferences remain available for stored guilds even when Discord
  details cannot be resolved. Configured channels and roles retain their IDs
  with null names when unresolved. Guild command deployment counts compare
  registered command names, not definitions or freshness.
- Channel listings exclude threads and group uncategorized channels first,
  then categories with their children, then children of unavailable parents.
  Role assignability reflects bot permissions, hierarchy, and managed roles.
- Preference updates follow the slash-command validation rules, clear dependent
  values when disabled, and do not post a confirmation message to the guild.
  Audit logging, member announcements, and warning audit messages also require
  `Embed Links` in their selected channels because they are sent as embeds.
- Purge-job requests accept `text`, `regex`, and `ignoreCase`. Both flags default
  to false, preserving literal, case-sensitive matching. With `regex: true`,
  supply an RE2 pattern without slash delimiters, such as `^error\b`.
  The shared bot/web matcher uses a linear-time RE2 engine, limits text to 2000
  characters and regex programs to 1000 instructions, and rejects empty,
  invalid, or unsupported patterns (including lookarounds and backreferences)
  with HTTP 400 before creating a job. `ignoreCase` applies to either mode.
  Regex whitespace is significant; literal text retains its existing trimming.
  Only one pending or active purge job can exist per guild. Scanning and explicit
  confirmation still happen on the job page.

## Bot actions and player sessions

- Bot guild counts come from the Discord cache. Member counts sum memberships
  across guilds, not unique people, and are null if any guild count is
  unavailable. Player timestamps describe the current track's playback position,
  not queue creation; total duration can be unknown. Dashboard data refreshes
  every 30 seconds.
- Bot overview gateway latency is the Discord client's current WebSocket ping,
  or null when unavailable. Dashboard API latency measures the browser's
  round trip for the bot-status request, not the bot's Discord command response
  time.
- Global guild-command undeployment requires confirmation, reports failures and
  time-limit truncation, and rejects concurrent dashboard runs.
- Dashboard self-kick requires confirmation and leaves all cached guilds except
  the configured player health-check guild, if present. An optional custom
  message is appended to the standard departure message. Leaving still proceeds
  when the message cannot be sent; results report both outcomes. Concurrent
  dashboard runs are rejected, and an interrupted request can have partially
  completed.
- Guild-config event processing is skipped while the bot is leaving or has left
  a guild, preventing departure-related events from disabling saved settings.

## Player WebSocket

`GET /api/v1/player/:sessionId` returns the current state of a player session
and is the only player HTTP route. Live updates and every control use a
Socket.IO WebSocket server on the same port, mounted at `/api/v1/websocket`.
It accepts the WebSocket transport only.

- The handshake needs the same signed-in, active session cookie as the HTTP
  routes, and an `Origin` from `ALLOWED_ORIGINS`. Open sessions are checked
  again every minute and disconnected when the session ends.
- Each player session is a room named `player:<sessionId>`. A client joins it
  with `player:subscribe` and receives `player:state` pushes, sent per viewer
  because what a user can control differs. Changes within 75 ms are combined
  and every subscriber also gets a fresh state every 30 seconds.
- Client events, all answered through an acknowledgement of
  `{ ok: true, ... }` or `{ ok: false, status, error }`, where `status`
  follows the HTTP status codes: `player:subscribe`, `player:unsubscribe`,
  `player:control` (`{ sessionId, control: { path, body? } }`, with the same
  paths and bodies as the former control routes) and `player:suggestions`.
- Server events: `player:state`, `player:ended` when the session ends, and
  `player:revoked` when the user can no longer view it.
- Controls re-check guild membership, voice channel and the session lock on
  every call. A connection is limited to 40 events per 10 seconds.
- The server is a single instance. Rooms live in memory, like the player
  queues themselves. A reverse proxy must pass WebSocket upgrades through.

## FebGoServe compatibility

The route contract does not automatically reproduce FebGoServe's middleware or
lifecycle. Preserve its cookie parser, `hpp`, CORS policy, request cancellation,
response guards, availability checks, initialization order, runtime auth,
endpoint order, status codes, response formats, and validation when migrating.
Jappan's middleware and timeout behavior differ; OpenAPI security metadata is
not a substitute for runtime checks.
