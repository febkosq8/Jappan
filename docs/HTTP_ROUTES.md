# HTTP routes and OpenAPI

Jappan registers Express routers from `src/routes/index.ts` and serves the generated OpenAPI 3.0 document at `/openapi.json` and Swagger UI at `/swagger`. Route definitions live in `src/helpers/route.ts`; the definition supplies documentation and a normal Express handler. Public routes and Better Auth are mounted under the `/api/v1` prefix (for example `/api/v1/public/health` and `/api/v1/auth/get-session`); `/openapi.json` and `/swagger` are unversioned. OpenAPI metadata does not validate requests or enforce authorization.

## Route definitions

Use `defineRouter(basePath, entries)` with route definitions and child routers in the order they should be mounted. Express matches entries in that order. The optional third argument configures router-wide `middleware` and optional `children` appended after the entries. Route-level middleware runs in order before the handler.

```ts
import { z } from "zod";
import { defineRouter } from "../helpers/route.js";

export default defineRouter("/items", [
	{
		method: "get",
		path: "/:id",
		tags: ["Items"],
		summary: "Get an item",
		errorMessage: "Failed to get item",
		parameters: [
			{ in: "path", name: "id", required: true, schema: z.string() },
			{ in: "query", name: "detail", schema: z.string().optional() },
		],
		responses: {
			200: { description: "Item", schema: z.object({ id: z.string() }) },
			404: { description: "Item not found", schema: z.object({ error: z.string() }) },
		},
		handler: (request, response) => response.json({ id: request.params.id }),
	},
]);
```

`schema` on a response is shorthand for an `application/json` response. Use `content: { "image/svg+xml": { schema: z.string() } }` for another media type or multiple formats. Omit both `schema` and `content` for a response without a documented body. Response headers accept either a description string (a string schema) or an object containing a Zod `schema`, optional `description`, and optional `required`. Document text returned by Express `sendStatus` as text, except for status codes such as 204 for which Express suppresses the body.

`parameters` supports path, query, header and cookie parameters. Every path parameter must have a matching entry marked `required: true`. `requestBody` accepts `description`, `required`, and a `content` map of media types to Zod schemas. Schemas describe the HTTP representation: for example, query parameters generally arrive as strings and should not be documented as numbers unless the wire format actually matches that schema. Inputs are converted using Zod's input schema; responses use its output schema.

Use `excludeFromOpenApi: true` to omit a route from both the OpenAPI document and Swagger UI. This does **not** disable or secure the endpoint. The homepage redirect and the spec endpoint use this option. Documented routes must use simple literal paths and `:name` path parameters. OpenAPI cannot represent Express `all` or wildcard routes directly: exclude them or mount an external router, and document supported operations separately if needed.

`defineExternalRouter(basePath, router, routes)` mounts an existing Express router. Its optional `routes` argument documents externally handled operations without registering handlers. Include the external router in the OpenAPI document separately when it must be mounted outside the regular router list, as with Better Auth. Keep this metadata aligned with the external handler. For an external `RequestHandler`, add it to an Express `Router` before mounting. Set application-level middleware in the HTTP setup, not in the OpenAPI document. Route and router middleware must call `next()` to continue or send a response.

By default, exceptions from route middleware or the handler are logged and receive a JSON 500 response. An explicitly declared 500 response is retained in the specification, so it must match what the handler actually returns. An optional Express `errorHandler` can replace the default before headers are sent; its route must declare a 500 response. Errors after headers are sent are forwarded to Express instead. Exceptions from router-wide middleware go to the application's error handler.

## Security

Register OpenAPI security schemes in `openApiOptions` in `src/routes/index.ts` and refer to them by name using a route's `security` array. Multiple array elements are alternatives; multiple scheme names in one element are required together. An empty array indicates no requirement. These are documentation only: install authentication and authorization middleware or check permissions in the handler separately.

Better Auth handles `/api/v1/auth/*`. `GET /api/v1/auth/get-session` returns the
current session and user, or `null` when signed out, and returns 503 when auth
or the database is unavailable. It is included in OpenAPI and Swagger; the
other Better Auth endpoints are not. Swagger's browser requests use the session
cookie for the API origin, so sign in on that origin to try an authenticated
request. The response includes a session token and should be treated as sensitive.
Better Auth is mounted before body parsing. Existing public routes remain public.
The reusable `requireSession` middleware only authenticates: future guild-specific
endpoints must additionally enforce their own authorization checks.

Routes can opt into `requireDatabase` and `requireDiscord` from
`src/handlers/availability.ts` to return 503 when those dependencies are
unavailable. These checks run only on routes that declare them; they do not
replace authorization or guarantee a dependency stays connected during a request.
The OpenAPI document automatically adds the error responses returned by
`requireDatabase`, `requireDiscord`, `requireSession`, and `requireAdmin`.
Responses sharing a status combine their descriptions. Router-level middleware is
included for nested routes. An explicit response keeps its content and adds the
middleware descriptions and JSON error schema as an alternative. Middleware
error schemas list the exact possible error strings.
Swagger also provides a selectable example for each middleware error.

`GET /api/v1/public/commands` lists global slash commands and subcommands
without requiring authentication. Each entry contains `id`, `type` (`command` or
`sub-command`), `name` (space-separated for subcommands), `description`,
`category`, `requiredBotPermissions`, and
`requiredUserPermissions`. Permission names use Discord's canonical keys, such
as `ViewChannel`. Subcommands
share the parent Discord command ID because Discord does not assign separate
IDs to subcommands. The ID is `null` until registration succeeds or when no
registered ID is available. Subcommands include their parent command's declared
permissions. An empty
`requiredUserPermissions` array means no default member permission requirement;
Discord server configuration and command-specific checks can restrict access.
Bot permissions are declared requirements, not a guarantee of availability in
any guild or channel. Guild-scoped admin commands are not included. The endpoint
returns 500 if command definitions have not yet loaded.
The dashboard's `/commands` page displays this public listing. The optional
`category` query parameter filters it by category; omitting it shows all
categories. The bot's help command and help button link to this page.

Dashboard admin pages redirect signed-out visitors to
`/auth/error?error=UNAUTHENTICATED` and accounts without active admin access to
`/auth/error?error=FORBIDDEN`. The same redirects apply when an admin API request
returns 401 or 403. Session lookup failures remain retryable rather than being
treated as an authorization failure.

`GET /api/v1/admin/guilds` requires an active admin session and returns all stored
guilds, including those the bot has left. Each entry contains `id`, `name`, and
`isActiveMember` (whether the bot is still in the guild, including temporarily
unavailable guilds). Active memberships appear first, with each group sorted by
name. When Discord guild data is available, the entry also includes `icon`
(`null` if the guild has no icon), `memberCount`, `joinedTimestamp` (Unix
milliseconds), `systemChannel` (an object with `id` and `name`, or `null`),
the bot's `permissions`, `hasRequiredPermissions`, and
`owner` with `userId`, `avatarUrl`, and `username`. `hasRequiredPermissions`
indicates whether all permissions declared by public commands and subcommands
are granted at guild level, including Discord's Administrator override; it does
not account for channel-specific permission overrides. The `permissions` array
lists the bot's explicitly granted guild-level permission flags.
The dashboard combines these flags with the public command requirements to show
guild-level command permission coverage, treating Administrator as granting all
permissions. This does not guarantee command availability: channel overrides,
user permissions, and other dependencies also apply.
Otherwise those fields are omitted and the stored name is used. The endpoint
returns 503 when Discord is disconnected rather than reporting unreliable
membership. If the owner or bot member cannot be fetched, the request fails
instead of returning incomplete details.
`GET /api/v1/admin/guilds/{guildId}` requires the same access and dependencies and
returns the same fields for one stored guild plus `preferences`: `auditLog`
(`enabled`, `channel`, `fullVerbosity`), `leveling` (`enabled`, `threshold`,
`role`), `memberAnnouncements` (`joinEnabled`, `leaveEnabled`,
`joinChannel`, `leaveChannel`), and `warnings` (`timeoutThreshold`,
`timeoutDurationHours`, `banThreshold`, `auditChannel`). Configured channels and
the leveling role are objects containing `id` and `name`; the name is `null`
when the channel or role cannot be resolved. Unconfigured channels, roles, and thresholds are `null`;
settings are returned even when Discord guild details are unavailable. The
dashboard displays these saved settings read-only. It returns
400 for an invalid Discord guild ID and 404 when the guild is not stored.
The Discord admin guild list uses the same stored-guild data and displays entries
with currently available Discord details. It requires the database to be connected.

Better Auth uses its MongoDB adapter; the corresponding Mongoose models in
`src/models/` allow internal services to query the same collections. Account
credentials, session tokens and verification values are excluded from normal
Mongoose query results; aggregation and direct MongoDB queries bypass those
projections. APIs must explicitly protect any sensitive fields they access and
must not expose them in responses. Auth indexes are created at startup without
dropping additional existing indexes.

Discord sign-in stores the provider username on both the auth user and Discord
account. The user `name` remains the Discord display name (falling back to the
username when Discord has no display name). Existing accounts receive a
username the next time they sign in; until then the field can be absent.

Auth users have an `active` or `blocked` status. New users default to `active`;
existing users without a status are treated as active. Blocked users cannot
create new sessions or sign in. Blocking a user does not revoke existing sessions.
The status cannot be set through Better Auth's user update endpoint.

Auth users have a `user` or `admin` role. A linked Discord account whose ID
appears in `ADMIN_USER_IDS` receives `admin`; other users receive `user`.
Roles are synchronized at startup and on sign-in, so removing an ID revokes the
role after restart. All instances sharing a database must use the same
`ADMIN_USER_IDS`. Users cannot change their own role through Better Auth.
Authorization checks for future APIs must enforce the role server-side.

```ts
// openApiOptions
{ securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "x-api-key" } } }

// route definition
security: [{ apiKey: [] }]
```

Unknown security scheme names, duplicate operations or parameters, unsupported documented paths, and missing path parameters cause spec generation to fail explicitly. The route remains registered, but `/openapi.json` reports the failure and logs its cause.

## FebGoServe compatibility notes

The route contract does not automatically reproduce FebGoServe's application middleware or lifecycle. Before migrating it, preserve its cookie parser, `hpp` query handling, CORS credentials and allowed headers, request cancellation and response guards, availability checks, and initialization order. Jappan currently uses its own CORS policy, body parsers and timeout response; it does not install cookie parsing or `hpp`, or provide FebGoServe's abort signal and response guards. FebGoServe's current authentication and permission checks are runtime behavior and must not be replaced by OpenAPI security metadata.

Avoid changing FebGoServe's endpoint order, status codes, text/SVG/JSON formats, external auth handler, or validation behavior when migrating. `sendStatus` may return a text body for statuses other than 204/304. The shared route contract is a foundation, not a promise that the two applications' middleware policies are identical.
