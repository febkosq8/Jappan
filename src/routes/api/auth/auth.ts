import { toNodeHandler } from "better-auth/node";
import { Router } from "express";
import { z } from "zod";

import { defineExternalRouter } from "../../../helpers/route.js";
import { getAuth } from "../../../services/auth.js";

const router = Router();

router.all("/api/auth/*splat", (request, response, next) => {
	const auth = getAuth();
	if (!auth) {
		response.status(503).json({ error: "Authentication is unavailable" });
		return;
	}
	void toNodeHandler(auth)(request, response).catch(next);
});

const dateTime = z.iso.datetime();

export default defineExternalRouter("/", router, [
	{
		method: "get",
		path: "/api/auth/get-session",
		tags: ["Authentication"],
		summary: "Get the current session",
		errorMessage: "Failed to get session",
		security: [{}, { sessionCookie: [] }],
		responses: {
			200: {
				description: "Current session and user, or null when signed out; may refresh the session cookie",
				schema: z
					.object({
						session: z.object({
							id: z.string(),
							userId: z.string(),
							token: z.string(),
							expiresAt: dateTime,
							createdAt: dateTime,
							updatedAt: dateTime,
							ipAddress: z.string().nullish(),
							userAgent: z.string().nullish(),
						}),
						user: z.object({
							id: z.string(),
							name: z.string(),
							email: z.string(),
							emailVerified: z.boolean(),
							image: z.string().nullish(),
							createdAt: dateTime,
							updatedAt: dateTime,
							username: z.string().nullish(),
							status: z.enum(["active", "blocked"]).optional(),
							role: z.enum(["user", "admin"]).optional(),
						}),
					})
					.nullable(),
			},
			401: { description: "Session refresh failed" },
			500: { description: "Session lookup failed" },
			503: { description: "Authentication unavailable", schema: z.object({ error: z.string() }) },
		},
	},
]);
