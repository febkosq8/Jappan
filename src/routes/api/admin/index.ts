import { z } from "zod";

import { getClient, isBotConnected } from "../../../bot.js";
import { requireAdmin, requireSession } from "../../../handlers/auth.js";
import { requireDatabase, requireDiscord } from "../../../handlers/availability.js";
import { defineRouter, errorResponseSchema } from "../../../helpers/route.js";
import { listAllGuilds } from "../../../services/adminGuild.js";

export default defineRouter("/admin", [
	{
		method: "get",
		path: "/guilds",
		tags: ["Admin"],
		summary: "List stored guilds",
		errorMessage: "Failed to list guilds",
		security: [{ sessionCookie: [] }],
		responses: {
			200: {
				description: "Stored guilds with current Discord membership and available details",
				schema: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						isActiveMember: z.boolean(),
						icon: z.string().nullable().optional(),
						memberCount: z.number().int().optional(),
						joinedTimestamp: z.number().int().optional(),
						systemChannel: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
						permissions: z.array(z.string()).optional(),
						hasRequiredPermissions: z.boolean().optional(),
						owner: z
							.object({
								userId: z.string(),
								avatarUrl: z.string(),
								username: z.string(),
							})
							.optional(),
					}),
				),
			},
			401: { description: "Authentication required", schema: errorResponseSchema },
			403: { description: "Admin access required", schema: errorResponseSchema },
			500: { description: "Failed to list guilds", schema: errorResponseSchema },
			503: { description: "Database, authentication, or Discord unavailable", schema: errorResponseSchema },
		},
		middleware: [requireDatabase, requireDiscord, requireSession, requireAdmin],
		handler: async (_request, response) => {
			const guilds = await listAllGuilds(getClient());
			return response.status(200).json(guilds);
		},
	},
]);
