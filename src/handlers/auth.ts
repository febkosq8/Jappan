import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";

import { documentUnavailable } from "../helpers/middleware.js";
import { getAuth, type AuthSession } from "../services/auth.js";
import { logger } from "../services/logger.js";

export const requireSession: RequestHandler = documentUnavailable(async (request, response, next) => {
	const auth = getAuth();
	if (!auth) {
		response.status(503).json({ error: "Authentication is unavailable" });
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
			response.status(401).json({ error: "Authentication required" });
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
		response.status(500).json({ error: "Session validation failed" });
	}
}, "Authentication unavailable");

export const requireAdmin: RequestHandler = (_request, response, next) => {
	const session: AuthSession | undefined = response.locals.authSession;
	if (!session) {
		response.status(401).json({ error: "Authentication required" });
		return;
	}
	if (session.user.role !== "admin" || (session.user.status !== "active" && session.user.status !== undefined)) {
		response.status(403).json({ error: "Admin access required" });
		return;
	}
	next();
};
