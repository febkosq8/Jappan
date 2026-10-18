import type { ErrorRequestHandler, Express, NextFunction, Request, Response } from "express";

import { routers } from "../routes/index.js";
import swagger, { DOCS_ROUTE } from "../routes/swagger.js";
import { logger } from "../services/logger.js";

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const QUIET_ROUTES = ["/public/health"];
const QUIET_METHODS = ["OPTIONS"];
const CSP_BASE =
	"object-src 'none'; frame-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests;";
const DEFAULT_CSP = `default-src 'none'; script-src 'none'; style-src 'none'; ${CSP_BASE}`;
// Swagger UI loads its scripts from the same origin but ships inline <style> blocks and data: images
const DOCS_CSP = `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; ${CSP_BASE}`;

const securityHeaders: Record<string, string> = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "no-cache, no-store, must-revalidate",
};

function processRequest(request: Request, response: Response, next: NextFunction): void {
	for (const [name, value] of Object.entries(securityHeaders)) {
		response.setHeader(name, value);
	}
	response.setHeader("Content-Security-Policy", request.path.startsWith(DOCS_ROUTE) ? DOCS_CSP : DEFAULT_CSP);
	response.setTimeout(REQUEST_TIMEOUT_MS, () => {
		logger.warn("HTTP", "HTTP request timed out", { method: request.method, url: request.originalUrl });
		if (!response.headersSent) {
			response.status(408).json({
				error: "Request timed out",
				method: request.method,
				route: request.originalUrl,
				timestamp: Date.now(),
			});
		}
	});
	if (!QUIET_ROUTES.some((route) => request.path.startsWith(route)) && !QUIET_METHODS.includes(request.method)) {
		logger.info("HTTP", "HTTP request received", {
			method: request.method,
			url: request.originalUrl,
		});
	}
	next();
}

const handleError: ErrorRequestHandler = (error: Error, request, response, next) => {
	if (response.headersSent) {
		next(error);
		return;
	}
	logger.warn("HTTP", "Malformed HTTP request blocked", {
		method: request.method,
		url: request.originalUrl,
		error: error?.message ?? String(error),
	});
	response.status(400).json({
		error: "This request is malformed!",
		method: request.method,
		route: request.originalUrl,
		timestamp: Date.now(),
	});
};

function handleNotFound(request: Request, response: Response): void {
	response.status(404).json({ error: "Nothing here yet", method: request.method, path: request.path });
}

export function registerHttpHandlers(app: Express): void {
	app.use(processRequest);
	app.use(swagger);
	for (const { basePath, router } of routers) {
		app.use(basePath, router);
	}
	app.use(handleNotFound);
	app.use(handleError);
}
