import { z } from "zod";
import type { Response } from "express";

import { getClient } from "../../../../bot.js";
import { requireAdmin, requireSession } from "../../../../handlers/auth.js";
import { requireDiscord } from "../../../../handlers/availability.js";
import { DISCORD_INTERACTION_TIME_LIMIT_MS } from "../../../../helpers/interaction.js";
import { defineRouter, errorResponseSchema } from "../../../../helpers/route.js";
import { undeployGuildCommandsGlobally } from "../../../../services/adminDeployment.js";
import { selfKickGuilds } from "../../../../helpers/adminGuild.js";
import type { AuthSession } from "../../../../services/auth.js";
import { getConfig } from "../../../../services/config.js";
import { logger } from "../../../../services/logger.js";
import { getActivePlayerSessions, runPlayerHealthCheck } from "../../../../services/player.js";
import { handleShutdown } from "../../../../services/shutdown.js";

const activePlayerSessionSchema = z.object({
	guild: z.object({ id: z.string(), name: z.string(), icon: z.string().url().nullable() }),
	channel: z.object({ id: z.string(), name: z.string() }).nullable(),
	user: z.object({ id: z.string(), username: z.string(), avatarUrl: z.string().url().nullable() }).nullable(),
	queueSize: z.number(),
	nowPlaying: z
		.object({
			name: z.string(),
			url: z.httpUrl().nullable(),
			timestamp: z.object({ current: z.string(), total: z.string().nullable() }).nullable(),
		})
		.nullable(),
	playerState: z.enum(["Playing", "Paused"]),
});

const stopBotRequestSchema = z.object({ confirm: z.literal(true) });
const stopBotResponseSchema = z.object({
	scheduled: z.literal(true),
	delayMilliseconds: z.number().int().positive(),
});
const undeployGuildsRequestSchema = z.object({ confirm: z.literal(true) });
const adminBotGuildUndeploymentResponseSchema = z.object({
	undeployedGuilds: z.array(z.object({ id: z.string(), name: z.string() })),
	failedGuilds: z.array(z.object({ id: z.string(), name: z.string() })),
	timeLimitReached: z.boolean(),
});
const selfKickRequestSchema = z.object({
	confirm: z.literal(true),
	message: z.string().max(1000, "Message must be 1000 characters or fewer").optional(),
});
const selfKickGuildSchema = z.object({ id: z.string(), name: z.string(), messageSent: z.boolean() });
const selfKickResponseSchema = z.object({
	protectedGuild: z.object({ id: z.string(), name: z.string() }).nullable(),
	leftGuilds: z.array(selfKickGuildSchema),
	failedGuilds: z.array(selfKickGuildSchema),
	timeLimitReached: z.boolean(),
});
const shutdownDelayMilliseconds = 5_000;
let shutdownScheduled = false;
let guildUndeploymentInProgress = false;
let selfKickInProgress = false;

function getAdminSession(response: Response): AuthSession | undefined {
	const session: AuthSession | undefined = response.locals.authSession;
	return session;
}

export default defineRouter("/bot", [
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
		method: "delete",
		path: "/undeploy-guilds",
		tags: ["Admin Bot"],
		summary: "Remove guild commands from every installed guild",
		errorMessage: "Failed to undeploy guild commands",
		security: [{ sessionCookie: [] }],
		requestBody: {
			required: true,
			content: { "application/json": { schema: undeployGuildsRequestSchema } },
		},
		responses: {
			200: {
				description: "Guild command undeployment results",
				schema: adminBotGuildUndeploymentResponseSchema,
			},
			400: { description: "Confirmation is required", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			409: { description: "Guild command undeployment is already in progress", schema: errorResponseSchema },
			503: { description: "Discord bot is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to undeploy guild commands", schema: errorResponseSchema },
		},
		middleware: [requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const session = getAdminSession(response);
			if (!session) return response.status(401).json({ error: "Authentication required" });

			const body = undeployGuildsRequestSchema.safeParse(request.body);
			if (!body.success) {
				return response
					.status(400)
					.json({ error: body.error.issues[0]?.message ?? "Confirmation is required" });
			}
			if (guildUndeploymentInProgress) {
				return response.status(409).json({ error: "Guild command undeployment is already in progress" });
			}

			guildUndeploymentInProgress = true;
			logger.info("ADMIN", "Global guild command undeployment requested via dashboard", {
				user: `${session.user.name} <${session.user.id}>`,
			});
			try {
				const result = await undeployGuildCommandsGlobally({
					client: getClient(),
					deadlineAt: Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS,
				});
				const responseData = {
					undeployedGuilds: result.undeployedGuilds.map(({ id, name }) => ({ id, name })),
					failedGuilds: result.failedGuilds.map(({ id, name }) => ({ id, name })),
					timeLimitReached: result.timeLimitReached,
				};
				logger.info("ADMIN", "Global guild command undeployment completed via dashboard", {
					user: `${session.user.name} <${session.user.id}>`,
					undeployedGuildCount: responseData.undeployedGuilds.length,
					failedGuildCount: responseData.failedGuilds.length,
					timeLimitReached: responseData.timeLimitReached,
				});
				return response.status(200).json(responseData);
			} finally {
				guildUndeploymentInProgress = false;
			}
		},
	},
	{
		method: "delete",
		path: "/self-kick",
		tags: ["Admin Bot"],
		summary: "Leave installed guilds except the player health-check guild",
		errorMessage: "Failed to leave guilds",
		security: [{ sessionCookie: [] }],
		requestBody: {
			required: true,
			content: { "application/json": { schema: selfKickRequestSchema } },
		},
		responses: {
			200: { description: "Self-kick results", schema: selfKickResponseSchema },
			400: { description: "Invalid confirmation or message", schema: errorResponseSchema },
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			409: { description: "Self-kick is already in progress", schema: errorResponseSchema },
			503: { description: "Discord bot is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to leave guilds", schema: errorResponseSchema },
		},
		middleware: [requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const session = getAdminSession(response);
			if (!session) return response.status(401).json({ error: "Authentication required" });
			const body = selfKickRequestSchema.safeParse(request.body);
			if (!body.success) {
				return response
					.status(400)
					.json({ error: body.error.issues[0]?.message ?? "Invalid self-kick request" });
			}
			if (selfKickInProgress) {
				return response.status(409).json({ error: "Self-kick is already in progress" });
			}

			selfKickInProgress = true;
			try {
				const invoker = { userName: session.user.name, userId: session.user.id };
				const message = body.data.message?.trim();
				logger.warn("ADMIN", "Self-kick requested via dashboard", {
					user: `${invoker.userName} <${invoker.userId}>`,
				});
				const result = await selfKickGuilds({
					config: getConfig(),
					invoker,
					deadlineAt: Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS,
					...(message ? { additionalMessage: message } : {}),
				});
				logger.info("ADMIN", "Dashboard self-kick completed", {
					user: `${invoker.userName} <${invoker.userId}>`,
					leftGuildCount: result.leftGuilds.length,
					failedGuildCount: result.failedGuilds.length,
					timeLimitReached: result.timeLimitReached,
				});
				return response.status(200).json(result);
			} finally {
				selfKickInProgress = false;
			}
		},
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
