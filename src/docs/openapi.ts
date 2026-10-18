import { getConfig } from "../services/config.js";

const healthSchema = {
	type: "object",
	required: ["healthy"],
	properties: { healthy: { type: "boolean" } },
} as const;

const errorSchema = {
	type: "object",
	required: ["error"],
	properties: { error: { type: "string" } },
} as const;

function healthOperation(summary: string, schema: object) {
	return {
		tags: ["Health"],
		summary,
		responses: {
			"200": { description: "Health status", content: { "application/json": { schema } } },
			"500": { description: "Health check failed", content: { "application/json": { schema: errorSchema } } },
		},
	};
}

export function getOpenApiDocument() {
	return {
		openapi: "3.0.3",
		info: {
			title: `${getConfig("BOT_NAME")} API`,
			description: `HTTP API for ${getConfig("BOT_NAME")}`,
			version: process.env.npm_package_version ?? "2.0.0",
		},
		tags: [{ name: "Base" }, { name: "Health" }],
		paths: {
			"/": {
				get: {
					tags: ["Base"],
					summary: "Redirect to the bot website",
					responses: {
						"307": {
							description: "Redirect to the bot website",
							headers: { Location: { schema: { type: "string" } } },
						},
						"500": {
							description: "Redirect failed",
							content: { "application/json": { schema: errorSchema } },
						},
					},
				},
			},
			"/health": {
				get: healthOperation("Overall service health", {
					type: "object",
					required: ["healthy", "services"],
					properties: {
						healthy: { type: "boolean" },
						services: {
							type: "object",
							properties: {
								db: { type: "boolean" },
								discord: { type: "boolean" },
								player: { type: "boolean" },
							},
						},
					},
				}),
			},
			"/health/db": { get: healthOperation("Database connection health", healthSchema) },
			"/health/discord": { get: healthOperation("Discord connection health", healthSchema) },
			"/health/player": { get: healthOperation("Music player availability", healthSchema) },
		},
	};
}
