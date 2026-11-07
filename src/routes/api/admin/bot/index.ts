import { z } from "zod";
import type { Response } from "express";

import { getClient } from "../../../../bot.js";
import { requireAdmin, requireSession } from "../../../../handlers/auth.js";
import { requireDiscord } from "../../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../../helpers/route.js";
import { getBotVersion } from "../../../../helpers/utils.js";
import type { AuthSession } from "../../../../services/auth.js";
import { getActivePlayerSessions, runPlayerHealthCheck } from "../../../../services/player.js";
import { logger } from "../../../../services/logger.js";
import { handleShutdown } from "../../../../services/shutdown.js";

const activePlayerSessionSchema = z.object({
	guild: z.object({ id: z.string(), name: z.string(), icon: z.string().url().nullable() }),
	channel: z.object({ id: z.string(), name: z.string() }).nullable(),
	user: z.object({ id: z.string(), username: z.string(), avatarUrl: z.string().url().nullable() }).nullable(),
	queueSize: z.number(),
	nowPlaying: z.object({ name: z.string(), url: z.httpUrl().nullable() }).nullable(),
	playerState: z.enum(["Playing", "Paused"]),
});

const adminBotStatusSchema = z.object({
	botName: z.string(),
	botAvatarUrl: z.string().url(),
	botId: z.string().nullable(),
	version: z.string(),
	bootedAtMs: z.number(),
});

const stopBotRequestSchema = z.object({ confirm: z.literal(true) });
const stopBotResponseSchema = z.object({
	scheduled: z.literal(true),
	delayMilliseconds: z.number().int().positive(),
});
const shutdownDelayMilliseconds = 5_000;
let shutdownScheduled = false;

function getAdminSession(response: Response): AuthSession | undefined {
	const session: AuthSession | undefined = response.locals.authSession;
	return session;
}

export default defineRouter("/bot", [
	{
		method: "get",
		path: "/",
		tags: ["Admin Bot"],
		summary: "View bot details",
		errorMessage: "Failed to get admin bot status",
		security: [{ sessionCookie: [] }],
		responses: {
			200: {
				description: "Bot details",
				schema: adminBotStatusSchema,
			},
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			503: { description: "Discord bot is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get admin bot status", schema: errorResponseSchema },
		},
		middleware: [requireDiscord, requireSession, requireAdmin],
		handler: (_request, response) => {
			const botUser = getClient().user;
			if (!botUser) {
				return response.status(503).json({ error: "Discord is unavailable" });
			}
			const returnData = {
				botName: botUser.username,
				botAvatarUrl: botUser.displayAvatarURL(),
				botId: botUser.id,
				version: getBotVersion(),
				bootedAtMs: Date.now() - Math.floor(process.uptime() * 1000),
			};
			return response.status(200).json(returnData);
		},
	},
	{
		method: "get",
		path: "/player-sessions",
		tags: ["Admin Bot"],
		summary: "View active player sessions",
		errorMessage: "Failed to get active player sessions",
		security: [{ sessionCookie: [] }],
		responses: {
			200: { description: "Active player sessions", schema: z.array(activePlayerSessionSchema) },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			503: { description: "Discord bot is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get active player sessions", schema: errorResponseSchema },
		},
		middleware: [requireDiscord, requireSession, requireAdmin],
		handler: (_request, response) => response.status(200).json(getActivePlayerSessions()),
	},
	{
		method: "put",
		path: "/player-health-check",
		tags: ["Admin Bot"],
		summary: "Refresh player health status",
		errorMessage: "Failed to refresh player health status",
		security: [{ sessionCookie: [] }],
		responses: {
			200: {
				description: "Updated player health status",
				schema: z.object({ healthy: z.boolean() }),
			},
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			500: { description: "Failed to refresh player health status", schema: errorResponseSchema },
		},
		middleware: [requireSession, requireAdmin],
		handler: async (_request, response) => {
			const session = getAdminSession(response);
			if (!session) return response.status(401).json({ error: "Authentication required" });

			logger.info("PLAYER", "Starting player health check via dashboard invocation", {
				user: `${session.user.name} <${session.user.id}>`,
			});
			const healthy = await runPlayerHealthCheck();
			return response.status(200).json({ healthy });
		},
	},
	{
		method: "delete",
		path: "/stop",
		tags: ["Admin Bot"],
		summary: "Stop the bot process",
		errorMessage: "Failed to schedule bot shutdown",
		security: [{ sessionCookie: [] }],
		requestBody: {
			required: true,
			content: { "application/json": { schema: stopBotRequestSchema } },
		},
		responses: {
			202: { description: "Bot shutdown scheduled", schema: stopBotResponseSchema },
			400: { description: "Confirmation is required", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			409: { description: "Bot shutdown is already scheduled", schema: errorResponseSchema },
			500: { description: "Failed to schedule bot shutdown", schema: errorResponseSchema },
		},
		middleware: [requireSession, requireAdmin],
		handler: (request, response) => {
			const session = getAdminSession(response);
			if (!session) return response.status(401).json({ error: "Authentication required" });

			const body = stopBotRequestSchema.safeParse(request.body);
			if (!body.success) {
				return response
					.status(400)
					.json({ error: body.error.issues[0]?.message ?? "Confirmation is required" });
			}
			if (shutdownScheduled) {
				return response.status(409).json({ error: "Bot shutdown is already scheduled" });
			}

			shutdownScheduled = true;
			logger.warn("ADMIN", "Bot stop requested via dashboard", {
				user: `${session.user.name} <${session.user.id}>`,
			});
			setTimeout(() => {
				void handleShutdown("ADMIN_STOP_BOT").catch((error: unknown) => {
					logger.error("ADMIN", "Bot shutdown failed after dashboard request", {
						error: error instanceof Error ? error.message : String(error),
					});
				});
			}, shutdownDelayMilliseconds);
			return response.status(202).json({ scheduled: true, delayMilliseconds: shutdownDelayMilliseconds });
		},
	},
]);
