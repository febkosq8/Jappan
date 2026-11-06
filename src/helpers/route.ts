import {
	Router,
	type ErrorRequestHandler,
	type NextFunction,
	type Request,
	type RequestHandler,
	type Response,
	type Router as ExpressRouter,
} from "express";
import { z } from "zod";

import { logger } from "../services/logger.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options" | "trace" | "all";

export interface RouteParameter {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	description?: string;
	required?: boolean;
	schema: z.ZodType;
}

export interface RouteMediaType {
	schema: z.ZodType;
}

export interface RouteHeader {
	description?: string;
	required?: boolean;
	schema: z.ZodType;
}

export interface RouteResponse {
	description: string;
	schema?: z.ZodType;
	content?: Record<string, RouteMediaType>;
	headers?: Record<string, string | RouteHeader>;
}

export interface RouteDefinition {
	method: HttpMethod;
	path: string;
	tags: string[];
	excludeFromOpenApi?: boolean;
	summary: string;
	errorMessage: string;
	responses: Record<number, RouteResponse>;
	parameters?: readonly RouteParameter[];
	requestBody?: {
		description?: string;
		required?: boolean;
		content: Record<string, RouteMediaType>;
	};
	security?: readonly Record<string, readonly string[]>[];
	middleware?: readonly RequestHandler[];
	errorHandler?: ErrorRequestHandler;
	handler: (request: Request, response: Response, next: NextFunction) => unknown | Promise<unknown>;
}

export interface RouterDefinition {
	basePath: string;
	router: ExpressRouter;
	routes: readonly RouteDefinition[];
}

export interface RouterOptions {
	middleware?: readonly RequestHandler[];
	children?: readonly RouterDefinition[];
}

export const errorResponseSchema = z.object({ error: z.string() });

function joinRoutePaths(parentPath: string, childPath: string): string {
	return `${parentPath}/${childPath}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
}

export function defineRouter(
	basePath: string,
	entries: readonly (RouteDefinition | RouterDefinition)[],
	options: RouterOptions = {},
): RouterDefinition {
	const router: ExpressRouter = Router();
	const routes: RouteDefinition[] = [];
	if (options.middleware?.length) {
		router.use(...options.middleware);
	}
	for (const entry of [...entries, ...(options.children ?? [])]) {
		if ("router" in entry) {
			router.use(entry.basePath, entry.router);
			routes.push(
				...entry.routes.map((route) => ({ ...route, path: joinRoutePaths(entry.basePath, route.path) })),
			);
			continue;
		}
		const route = entry;
		routes.push(route);
		const handleRouteError: ErrorRequestHandler = async (error, request, response, next) => {
			logger.error("HTTP", route.errorMessage, {
				method: request.method,
				url: request.originalUrl,
				error: error instanceof Error ? error.message : String(error),
			});
			if (response.headersSent) {
				next(error);
			} else if (route.errorHandler) {
				await route.errorHandler(error, request, response, next);
			} else {
				response.status(500).json({ error: route.errorMessage });
			}
		};
		router[route.method](
			route.path,
			...(route.middleware ?? []),
			async (request: Request, response: Response, next: NextFunction) => {
				await route.handler(request, response, next);
			},
			handleRouteError,
		);
	}
	return { basePath, router, routes };
}

export function defineExternalRouter(basePath: string, router: ExpressRouter): RouterDefinition {
	return { basePath, router, routes: [] };
}
