import { z } from "zod";

import { getUnavailableDescription } from "../helpers/middleware.js";
import {
	errorResponseSchema,
	type RouteMediaType,
	type RouteParameter,
	type RouteResponse,
	type RouterDefinition,
} from "../helpers/route.js";
import { getConfig } from "../services/config.js";

type OAuthFlow = {
	authorizationUrl?: string;
	tokenUrl?: string;
	refreshUrl?: string;
	scopes: Record<string, string>;
};

export type SecurityScheme =
	| { type: "apiKey"; name: string; in: "query" | "header" | "cookie"; description?: string }
	| { type: "http"; scheme: string; bearerFormat?: string; description?: string }
	| {
			type: "oauth2";
			flows: {
				implicit?: OAuthFlow & { authorizationUrl: string };
				password?: OAuthFlow & { tokenUrl: string };
				clientCredentials?: OAuthFlow & { tokenUrl: string };
				authorizationCode?: OAuthFlow & { authorizationUrl: string; tokenUrl: string };
			};
			description?: string;
	  }
	| { type: "openIdConnect"; openIdConnectUrl: string; description?: string };

export interface OpenApiOptions {
	securitySchemes?: Record<string, SecurityScheme>;
}

function toJsonSchema(schema: z.ZodType, io: "input" | "output" = "output") {
	const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, { target: "openapi-3.0", io }) as Record<
		string,
		unknown
	>;
	return jsonSchema;
}

function toContent(content: Record<string, RouteMediaType>, io: "input" | "output") {
	return Object.fromEntries(
		Object.entries(content).map(([mediaType, value]) => [mediaType, { schema: toJsonSchema(value.schema, io) }]),
	);
}

function toOpenApiPath(basePath: string, routePath: string): { path: string; parameters: string[] } {
	const joined = `${basePath}/${routePath}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
	if (!/^(?:\/[A-Za-z0-9._~%-]*|:[A-Za-z0-9_]+)*\/?$/.test(joined)) {
		throw new Error(`Unsupported OpenAPI route path: ${joined}. Exclude the route or use a simple path.`);
	}
	const parameters: string[] = [];
	const path = joined.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
		parameters.push(name);
		return `{${name}}`;
	});
	return { path, parameters };
}

function toParameters(parameters: readonly RouteParameter[], pathParameters: readonly string[], path: string) {
	const seen = new Set<string>();
	for (const parameter of parameters) {
		const key = `${parameter.in}:${parameter.name}`;
		if (seen.has(key)) {
			throw new Error(`Duplicate OpenAPI parameter ${key} for ${path}`);
		}
		seen.add(key);
		if (parameter.in === "path" && (parameter.required !== true || !pathParameters.includes(parameter.name))) {
			throw new Error(`Path parameter ${parameter.name} for ${path} must match the path and be required`);
		}
	}
	for (const name of pathParameters) {
		if (!seen.has(`path:${name}`)) {
			throw new Error(`Missing OpenAPI path parameter ${name} for ${path}`);
		}
	}
	return parameters.map((parameter) => ({
		...parameter,
		schema: toJsonSchema(parameter.schema, "input"),
	}));
}

export function getOpenApiDocument(routers: readonly RouterDefinition[], options: OpenApiOptions = {}) {
	const paths: Record<string, Record<string, unknown>> = {};
	const tags = new Set<string>();

	for (const { basePath, routes } of routers) {
		for (const route of routes) {
			if (route.excludeFromOpenApi) {
				continue;
			}
			if (route.method === "all") {
				throw new Error(`OpenAPI cannot document all methods for ${basePath}${route.path}; exclude the route`);
			}
			const hasCustomErrorHandler = "errorHandler" in route && Boolean(route.errorHandler);
			if (hasCustomErrorHandler && !route.responses[500]) {
				throw new Error(
					`A custom error handler requires an explicit 500 response for ${basePath}${route.path}`,
				);
			}
			route.tags.forEach((tag) => tags.add(tag));
			const responses: Record<string, unknown> = {};
			const unavailableDescriptions = [
				...new Set(
					[...(route.inheritedMiddleware ?? []), ...("middleware" in route ? (route.middleware ?? []) : [])]
						.map(getUnavailableDescription)
						.filter((description): description is string => description !== undefined),
				),
			];
			const unavailableResponse = route.responses[503];
			const routeResponses: Record<number, RouteResponse> = {
				...route.responses,
				...(unavailableDescriptions.length && {
					503: {
						...(unavailableResponse ?? { schema: errorResponseSchema }),
						description: [unavailableResponse?.description, ...unavailableDescriptions]
							.filter(Boolean)
							.join("; "),
					},
				}),
			};
			for (const [status, response] of Object.entries(routeResponses)) {
				if (response.schema && response.content) {
					throw new Error(
						`Response ${status} for ${basePath}${route.path} cannot have both schema and content`,
					);
				}
				let content = response.schema
					? { "application/json": { schema: toJsonSchema(response.schema) } }
					: response.content
						? toContent(response.content, "output")
						: undefined;
				if (status === "503" && unavailableDescriptions.length && unavailableResponse) {
					const jsonResponse = content?.["application/json"];
					const middlewareSchema = toJsonSchema(errorResponseSchema);
					content = {
						...content,
						"application/json": {
							schema: jsonResponse
								? { anyOf: [jsonResponse.schema, middlewareSchema] }
								: middlewareSchema,
						},
					};
				}
				responses[status] = {
					description: response.description,
					...(response.headers && {
						headers: Object.fromEntries(
							Object.entries(response.headers).map(([name, header]) => [
								name,
								typeof header === "string"
									? { description: header, schema: { type: "string" } }
									: { ...header, schema: toJsonSchema(header.schema) },
							]),
						),
					}),
					...(content && { content }),
				};
			}
			if (!responses["500"] && !hasCustomErrorHandler) {
				responses["500"] = {
					description: route.errorMessage,
					content: { "application/json": { schema: toJsonSchema(errorResponseSchema) } },
				};
			}
			const { path, parameters: pathParameters } = toOpenApiPath(basePath, route.path);
			const parameters = toParameters(route.parameters ?? [], pathParameters, path);
			for (const requirement of route.security ?? []) {
				for (const scheme of Object.keys(requirement)) {
					if (!options.securitySchemes?.[scheme]) {
						throw new Error(`Unknown OpenAPI security scheme ${scheme} for ${path}`);
					}
				}
			}
			if (paths[path]?.[route.method]) {
				throw new Error(`Duplicate OpenAPI operation ${route.method.toUpperCase()} ${path}`);
			}
			paths[path] = {
				...paths[path],
				[route.method]: {
					tags: route.tags,
					summary: route.summary,
					...(parameters.length && { parameters }),
					...(route.requestBody && {
						requestBody: {
							...route.requestBody,
							content: toContent(route.requestBody.content, "input"),
						},
					}),
					...(route.security && { security: route.security }),
					responses,
				},
			};
		}
	}

	return {
		openapi: "3.0.3",
		servers: [{ url: "/" }],
		info: {
			title: `${getConfig("BOT_NAME")} API`,
			description: `HTTP API for ${getConfig("BOT_NAME")}`,
			version: process.env.npm_package_version ?? "2.0.0",
		},
		tags: [...tags].map((name) => ({ name })),
		...(options.securitySchemes && { components: { securitySchemes: options.securitySchemes } }),
		paths,
	};
}
