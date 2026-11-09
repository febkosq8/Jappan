import type { ErrorRequestHandler, Express, NextFunction, Request, Response } from "express";
import express from "express";
import cors from "cors";

import { routers } from "../routes/index.js";
import authRouter from "../routes/api/auth/auth.js";
import swagger, { DOCS_ROUTE } from "../routes/swagger.js";
import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";
import { getBotVersion } from "../helpers/utils.js";

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const QUIET_ROUTES = ["/api/v1/public/health"];
const QUIET_METHODS = ["OPTIONS"];
const AUTH_ROUTE_PREFIX = "/api/v1/auth/";
const CSP_BASE =
	"object-src 'none'; frame-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; upgrade-insecure-requests;";
const DEFAULT_CSP = `default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self' https://cdn.discordapp.com; ${CSP_BASE}`;
// Swagger UI loads its scripts from the same origin but ships inline <style> blocks and data: images
const DOCS_CSP = `default-src 'none'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; ${CSP_BASE}`;

class CorsOriginError extends Error {}

const securityHeaders: Record<string, string> = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "no-cache, no-store, must-revalidate",
};

function processRequest(request: Request, response: Response, next: NextFunction): void {
	const requestUrl = request.path.startsWith(AUTH_ROUTE_PREFIX) ? request.path : request.originalUrl;
	for (const [name, value] of Object.entries(securityHeaders)) {
		response.setHeader(name, value);
	}
	response.setHeader("X-Request-Timeout-Ms", REQUEST_TIMEOUT_MS.toString());
	response.setHeader("X-Version", `v${getBotVersion()}`);
	response.setHeader("Content-Security-Policy", request.path.startsWith(DOCS_ROUTE) ? DOCS_CSP : DEFAULT_CSP);
	response.setTimeout(REQUEST_TIMEOUT_MS, () => {
		logger.warn("HTTP", "HTTP request timed out", { method: request.method, url: requestUrl });
		if (!response.headersSent) {
			response.status(408).json({
				error: "Request timed out",
				method: request.method,
				route: requestUrl,
				timestamp: Date.now(),
			});
		}
	});
	if (!QUIET_ROUTES.some((route) => request.path.startsWith(route)) && !QUIET_METHODS.includes(request.method)) {
		logger.info("HTTP", "HTTP request received", {
			method: request.method,
			url: requestUrl,
		});
	}
	next();
}

const handleError: ErrorRequestHandler = (error: Error, request, response, next) => {
	if (response.headersSent) {
		next(error);
		return;
	}
	const isCorsOriginError = error instanceof CorsOriginError;
	const isClientError =
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof error.status === "number" &&
		error.status >= 400 &&
		error.status < 500;
	const status = isCorsOriginError ? 403 : isClientError ? 400 : 500;
	const origin = request.get("origin");
	const loggedOrigin = origin === undefined || origin === "" || origin === "null" ? "<null>" : origin;
	const message = isCorsOriginError
		? "HTTP request blocked: origin not allowed"
		: isClientError
			? "Malformed HTTP request blocked"
			: "Unhandled HTTP error";
	const details = {
		method: request.method,
		url: request.path.startsWith(AUTH_ROUTE_PREFIX) ? request.path : request.originalUrl,
		...(isCorsOriginError ? { origin: loggedOrigin } : {}),
		error: isCorsOriginError ? "Origin is not allowed by CORS" : (error?.message ?? String(error)),
	};
	if (status === 500) {
		logger.error("HTTP", message, details);
	} else {
		logger.warn("HTTP", message, details);
	}
	response.status(status).json({
		error: isCorsOriginError
			? "Origin is not allowed"
			: isClientError
				? "This request is malformed!"
				: "Internal server error",
		method: request.method,
		route: request.path.startsWith(AUTH_ROUTE_PREFIX) ? request.path : request.originalUrl,
		timestamp: Date.now(),
	});
};

function handleNotFound(request: Request, response: Response): void {
	response.status(404).json({ error: "Nothing here yet", method: request.method, path: request.path });
}

export function registerHttpHandlers(app: Express): void {
	app.use(processRequest);
	const allowedOrigins = getConfig("ALLOWED_ORIGINS");
	app.use(
		cors({
			origin: (origin, callback) => {
				if (origin === undefined || allowedOrigins.includes(origin)) {
					callback(null, true);
					return;
				}
				callback(new CorsOriginError(`Origin is not allowed by CORS`));
			},
			methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
			maxAge: 86400,
		}),
	);
	app.use(authRouter.basePath, authRouter.router);
	app.use(express.json({ limit: "25mb" }));
	app.use(express.urlencoded({ limit: "25mb", extended: false }));
	app.use(swagger);
	for (const { basePath, router } of routers) {
		app.use(basePath, router);
	}
	app.use(handleNotFound);
	app.use(handleError);
}
