import { z } from "zod";

import { getClient } from "../../../../bot.js";
import { requireAdmin, requireSession } from "../../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../../helpers/route.js";
import { getAdminGuild, listAdminGuildChannels, listAllGuilds } from "../../../../services/adminGuild.js";

const guildSchema = z.object({
	id: z.string(),
	name: z.string(),
	isActiveMember: z.boolean(),
	icon: z.string().nullable().optional(),
	memberCount: z.number().int().optional(),
	channelCount: z.number().int().nonnegative().optional(),
	createdAt: z.number().int().optional(),
	description: z.string().nullable().optional(),
	joinedTimestamp: z.number().int().optional(),
	systemChannel: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
	permissions: z.array(z.string()).optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: z.object({ userId: z.string(), avatarUrl: z.string(), username: z.string() }).optional(),
});

const preferenceEntitySchema = z.object({ id: z.string(), name: z.string().nullable() }).nullable();

const guildDetailsSchema = guildSchema.extend({
	discoveredAt: z.number().int().nullable(),
	preferences: z.object({
		auditLog: z.object({
			enabled: z.boolean(),
			channel: preferenceEntitySchema,
			fullVerbosity: z.boolean(),
		}),
		leveling: z.object({
			enabled: z.boolean(),
			threshold: z.number().nullable(),
			role: preferenceEntitySchema,
		}),
		memberAnnouncements: z.object({
			joinEnabled: z.boolean(),
			leaveEnabled: z.boolean(),
			joinChannel: preferenceEntitySchema,
			leaveChannel: preferenceEntitySchema,
		}),
		warnings: z.object({
			timeoutThreshold: z.number().nullable(),
			timeoutDurationHours: z.number().nullable(),
			banThreshold: z.number().nullable(),
			auditChannel: preferenceEntitySchema,
		}),
	}),
});

export default defineRouter("/guilds", [
	{
		method: "get",
		path: "/:guildId/channels",
		tags: ["Admin Guilds"],
		summary: "List channels in a registered guild",
		errorMessage: "Failed to list guild channels",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: {
				description: "Guild channels and categories, excluding threads",
				schema: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						type: z.number().int(),
						typeName: z.string(),
						createdAt: z.number().int(),
						parent: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
						position: z.number().int(),
						topic: z.string().nullable().optional(),
						nsfw: z.boolean().optional(),
						rateLimitPerUser: z.number().int().nullable().optional(),
						bitrate: z.number().int().optional(),
						userLimit: z.number().int().optional(),
					}),
				),
			},
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			409: { description: "Bot is not a guild member", schema: errorResponseSchema },
			503: { description: "Guild or service unavailable", schema: errorResponseSchema },
			500: { description: "Failed to list guild channels", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const result = await listAdminGuildChannels(getClient(), guildId);
			switch (result.status) {
				case "not_found":
					return response.status(404).json({ error: "Guild not found" });
				case "not_member":
					return response.status(409).json({ error: "Bot is not a guild member" });
				case "unavailable":
					return response.status(503).json({ error: "Guild is unavailable" });
				case "ok":
					return response.status(200).json(result.channels);
			}
		},
	},
	{
		method: "get",
		path: "/",
		tags: ["Admin Guilds"],
		summary: "List registered guilds",
		errorMessage: "Failed to list guilds",
		security: [{ sessionCookie: [] }],
		responses: {
			200: {
				description: "Registered guilds with current Discord membership and available details",
				schema: z.array(guildSchema),
			},
			500: { description: "Failed to list guilds", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (_request, response) => {
			const guilds = await listAllGuilds(getClient());
			return response.status(200).json(guilds);
		},
	},
	{
		method: "get",
		path: "/:guildId",
		tags: ["Admin Guilds"],
		summary: "Get a registered guild",
		errorMessage: "Failed to get guild",
		security: [{ sessionCookie: [] }],
		parameters: [
			{
				name: "guildId",
				in: "path",
				required: true,
				description: "Discord guild ID",
				schema: z.string().regex(/^\d{17,20}$/u),
			},
		],
		responses: {
			200: {
				description: "Registered guild with current Discord membership and available details",
				schema: guildDetailsSchema,
			},
			400: { description: "Invalid guild ID", schema: errorResponseSchema },
			404: { description: "Guild not found", schema: errorResponseSchema },
			500: { description: "Failed to get guild", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (request, response) => {
			const guildId = request.params.guildId;
			if (typeof guildId !== "string" || !/^\d{17,20}$/u.test(guildId)) {
				return response.status(400).json({ error: "Invalid guild ID" });
			}
			const guild = await getAdminGuild(getClient(), guildId);
			if (!guild) {
				return response.status(404).json({ error: "Guild not found" });
			}
			return response.status(200).json(guild);
		},
	},
]);
