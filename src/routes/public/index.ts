import { z } from "zod";

import { getClient } from "../../bot.js";
import { getBotVersion } from "../../helpers/utils.js";
import { defineRouter, errorResponseSchema } from "../../helpers/route.js";
import type { RouteDefinition } from "../../helpers/route.js";
import commandsRouter from "./commands.js";
import healthRouter from "./health.js";

const botStatusSchema = z.object({
	botName: z.string(),
	botAvatarUrl: z.string().url(),
	botId: z.string().nullable(),
	version: z.string(),
	bootedAtMs: z.number(),
	guildCount: z.number().int().nonnegative(),
	memberCount: z.number().int().nonnegative().nullable(),
	gatewayLatencyMs: z.number().nonnegative().nullable(),
});

const publicRoutes: RouteDefinition[] = [
	{
		method: "get",
		path: "/bot",
		tags: ["Public"],
		summary: "View bot status",
		errorMessage: "Failed to get bot status",
		responses: {
			200: { description: "Bot status", schema: botStatusSchema },
			503: { description: "Discord bot is unavailable", schema: errorResponseSchema },
			500: { description: "Failed to get bot status", schema: errorResponseSchema },
		},
		handler: (_request, response) => {
			const client = getClient();
			const botUser = client.user;
			if (!botUser) {
				return response.status(503).json({ error: "Discord is unavailable" });
			}
			const guilds = [...client.guilds.cache.values()];
			const gatewayLatency = client.ws.ping;
			const returnData = {
				botName: botUser.username,
				botAvatarUrl: botUser.displayAvatarURL(),
				botId: botUser.id,
				version: getBotVersion(),
				bootedAtMs: Date.now() - Math.floor(process.uptime() * 1000),
				guildCount: guilds.length,
				memberCount: guilds.every((guild) => guild.available && Number.isFinite(guild.memberCount))
					? guilds.reduce((total, guild) => total + guild.memberCount, 0)
					: null,
				gatewayLatencyMs: Number.isFinite(gatewayLatency) && gatewayLatency >= 0 ? gatewayLatency : null,
			};
			return response.status(200).json(returnData);
		},
	},
];

export default defineRouter("/public", [...publicRoutes, commandsRouter, healthRouter]);
