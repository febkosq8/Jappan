import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { z } from "zod";

import { logger } from "../services/logger.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface RouteResponse {
	description: string;
	schema?: z.ZodType;
	headers?: Record<string, string>;
}

export interface RouteDefinition {
	method: HttpMethod;
	path: string;
	tags: string[];
	// Excluded from the OpenAPI spec, e.g. redirects that Swagger UI cannot execute
	hidden?: boolean;
	summary: string;
	// Message sent in the shared 500 response when the handler throws
	errorMessage: string;
	responses: Record<number, RouteResponse>;
	handler: (request: Request, response: Response) => unknown | Promise<unknown>;
}

export interface RouterDefinition {
	basePath: string;
	router: ExpressRouter;
	routes: readonly RouteDefinition[];
}

export const errorResponseSchema = z.object({ error: z.string() });

export function defineRouter(basePath: string, routes: readonly RouteDefinition[]): RouterDefinition {
	const router: ExpressRouter = Router();
	for (const route of routes) {
		router[route.method](route.path, async (request, response) => {
			try {
				await route.handler(request, response);
			} catch (error) {
				logger.error("HTTP", route.errorMessage, {
					method: request.method,
					url: request.originalUrl,
					error: error instanceof Error ? error.message : String(error),
				});
				if (!response.headersSent) {
					response.status(500).json({ error: route.errorMessage });
				}
			}
		});
	}
	return { basePath, router, routes };
}
