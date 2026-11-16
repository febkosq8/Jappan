# HTTP routes and OpenAPI

Routes are registered through `src/routes/index.ts` under `/api/v1`. The
generated specification is available at `/openapi.json` and Swagger UI at
`/swagger`; use these for the route inventory and request/response schemas.
This document covers major, app-wide API design decisions, not routine feature
changes or endpoint-specific behavior and fields.

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
- Better Auth uses MongoDB directly; Mongoose models expose the same collections
  internally. Normal Mongoose projections exclude credentials, session tokens,
  and verification values, but aggregation and direct MongoDB queries bypass
  those projections. Auth indexes are created without dropping other indexes.

## Shared response and query conventions

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
- Discord user objects in API responses use the same `id`, `displayName`,
  `username`, and `avatarUrl` fields. `displayName` is `null` when Discord does
  not provide one; the dashboard then displays `@username`. Unavailable avatars
  are `null`.
- Numeric bot, guild, channel, and invite timestamps use `*TimestampMs` field
  names and represent milliseconds since the Unix epoch. Better Auth uses its
  own ISO date fields.

## WebSocket

The Socket.IO server shares the HTTP port at `/api/v1/websocket` and accepts
the WebSocket transport only.

- The dashboard shares a socket between features and reports its current
  consumers at connection time for logging only; this client-provided metadata
  is not used for authentication or authorization.
- The handshake needs the same signed-in, active session cookie as the HTTP
  routes, and an `Origin` from `ALLOWED_ORIGINS`. Open sessions are checked
  again every minute and disconnected when the session ends.
- Features enforce their own authorization for subscriptions and operations.
  Rooms live in memory, and a reverse proxy must pass WebSocket upgrades through.

## FebGoServe compatibility

The route contract does not automatically reproduce FebGoServe's middleware or
lifecycle. Preserve its cookie parser, `hpp`, CORS policy, request cancellation,
response guards, availability checks, initialization order, runtime auth,
endpoint order, status codes, response formats, and validation when migrating.
Jappan's middleware and timeout behavior differ; OpenAPI security metadata is
not a substitute for runtime checks.
