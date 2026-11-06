# HTTP routes and OpenAPI

Jappan registers Express routers from `src/routes/index.ts` and serves the generated OpenAPI 3.0 document at `/openapi.json` and Swagger UI at `/swagger`. Route definitions live in `src/helpers/route.ts`; the definition supplies documentation and a normal Express handler. OpenAPI metadata does not validate requests or enforce authorization.

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

`defineExternalRouter(basePath, router)` mounts an existing Express router without adding its routes to OpenAPI. This is intended for integrations that manage their own routes, such as Better Auth. For an external `RequestHandler`, add it to an Express `Router` before mounting. Set application-level middleware in the HTTP setup, not in the OpenAPI document. Route and router middleware must call `next()` to continue or send a response.

By default, exceptions from route middleware or the handler are logged and receive a JSON 500 response. An explicitly declared 500 response is retained in the specification, so it must match what the handler actually returns. An optional Express `errorHandler` can replace the default before headers are sent; its route must declare a 500 response. Errors after headers are sent are forwarded to Express instead. Exceptions from router-wide middleware go to the application's error handler.

## Security

Register OpenAPI security schemes in `openApiOptions` in `src/routes/index.ts` and refer to them by name using a route's `security` array. Multiple array elements are alternatives; multiple scheme names in one element are required together. An empty array indicates no requirement. These are documentation only: install authentication and authorization middleware or check permissions in the handler separately.

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
