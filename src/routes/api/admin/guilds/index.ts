import { z } from "zod";

import { getClient } from "../../../../bot.js";
import { requireAdmin, requireSession } from "../../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../../helpers/route.js";
import { getAdminGuild, listAllGuilds } from "../../../../services/adminGuild.js";

const guildSchema = z.object({
	id: z.string(),
	name: z.string(),
	isActiveMember: z.boolean(),
	icon: z.string().nullable().optional(),
	memberCount: z.number().int().optional(),
	joinedTimestamp: z.number().int().optional(),
	systemChannel: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
	permissions: z.array(z.string()).optional(),
	hasRequiredPermissions: z.boolean().optional(),
	owner: z.object({ userId: z.string(), avatarUrl: z.string(), username: z.string() }).optional(),
});

export default defineRouter("/guilds", [
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
				schema: guildSchema,
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
