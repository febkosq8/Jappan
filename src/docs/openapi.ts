import { z } from "zod";

import { errorResponseSchema, type RouterDefinition } from "../helpers/route.js";
import { getConfig } from "../services/config.js";

function toJsonSchema(schema: z.ZodType) {
	const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, { target: "openapi-3.0" }) as Record<
		string,
		unknown
	>;
	return jsonSchema;
}

function toOpenApiPath(basePath: string, routePath: string): string {
	const joined = `${basePath}/${routePath}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
	return joined.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function getOpenApiDocument(routers: readonly RouterDefinition[]) {
	const paths: Record<string, Record<string, unknown>> = {};
	const tags = new Set<string>();

	for (const { basePath, routes } of routers) {
		for (const route of routes) {
			if (route.hidden) {
				continue;
			}
			route.tags.forEach((tag) => tags.add(tag));
			const responses: Record<string, unknown> = {};
			for (const [status, response] of Object.entries(route.responses)) {
				responses[status] = {
					description: response.description,
					...(response.headers && {
						headers: Object.fromEntries(
							Object.entries(response.headers).map(([name, description]) => [
								name,
								{ description, schema: { type: "string" } },
							]),
						),
					}),
					...(response.schema && {
						content: { "application/json": { schema: toJsonSchema(response.schema) } },
					}),
				};
			}
			responses["500"] = {
				description: route.errorMessage,
				content: { "application/json": { schema: toJsonSchema(errorResponseSchema) } },
			};
			const fullPath = toOpenApiPath(basePath, route.path);
			paths[fullPath] = {
				...paths[fullPath],
				[route.method]: { tags: route.tags, summary: route.summary, responses },
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
		paths,
	};
}
