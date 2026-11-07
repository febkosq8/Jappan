import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";

import { documentMiddlewareResponses } from "../helpers/middleware.js";
import { getAuth, type AuthSession } from "../services/auth.js";
import { logger } from "../services/logger.js";

const authenticationRequired = "Authentication required";
const authenticationUnavailable = "Authentication is unavailable";
const sessionValidationFailed = "Session validation failed";
const adminAccessRequired = "Admin access required";

export const requireSession: RequestHandler = documentMiddlewareResponses(
	async (request, response, next) => {
		const auth = getAuth();
		if (!auth) {
			response.status(503).json({ error: authenticationUnavailable });
			return;
		}
		try {
			const { response: session, headers } = await auth.api.getSession({
				headers: fromNodeHeaders(request.headers),
				returnHeaders: true,
			});
			for (const cookie of headers.getSetCookie()) {
				response.append("Set-Cookie", cookie);
			}
			if (!session) {
				response.status(401).json({ error: authenticationRequired });
				return;
			}
			response.locals.authSession = session;
			next();
		} catch (error: unknown) {
			logger.error("HTTP", "Session validation failed", {
				method: request.method,
				path: request.path,
				error: error instanceof Error ? error.message : String(error),
			});
			response.status(500).json({ error: sessionValidationFailed });
		}
	},
	{ 401: authenticationRequired, 500: sessionValidationFailed, 503: authenticationUnavailable },
);

export const requireAdmin: RequestHandler = documentMiddlewareResponses(
	(_request, response, next) => {
		const session: AuthSession | undefined = response.locals.authSession;
		if (!session) {
			response.status(401).json({ error: authenticationRequired });
			return;
		}
		if (session.user.role !== "admin" || (session.user.status !== "active" && session.user.status !== undefined)) {
			response.status(403).json({ error: adminAccessRequired });
			return;
		}
		next();
	},
	{ 401: authenticationRequired, 403: adminAccessRequired },
);
