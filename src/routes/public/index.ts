import { PermissionsBitField } from "discord.js";
import { z } from "zod";

import { getClient } from "../../bot.js";
import { getGuilds } from "../../helpers/guild.js";
import { defineRouter, errorResponseSchema } from "../../helpers/route.js";
import type { RouteDefinition } from "../../helpers/route.js";
import { getBotVersion } from "../../helpers/utils.js";
import { getCommandId, getGlobalCommands, type BotCommandData } from "../../services/commandLoader.js";
import healthRouter from "./health.js";

const commandSchema = z.object({
	id: z.string().nullable(),
	type: z.enum(["command", "sub-command"]),
	name: z.string(),
	description: z.string(),
	category: z.enum(["general", "music", "level", "fun", "moderator", "admin"]),
	requiredBotPermissions: z.array(z.string()),
	requiredUserPermissions: z.array(z.string()),
});

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
			const guilds = getGuilds({ source: "discord" });
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
	{
		method: "get",
		path: "/commands",
		tags: ["Public"],
		summary: "List global slash commands and subcommands",
		errorMessage: "Failed to list commands",
		responses: {
			200: {
				description: "Global command descriptions and declared permissions",
				schema: z.array(commandSchema),
			},
			500: { description: "Failed to list commands", schema: errorResponseSchema },
		},
		handler: (_request, response) => {
			const entries: z.infer<typeof commandSchema>[] = [];
			const addEntry = ({
				command,
				id,
				prefix,
				botPermissions,
				userPermissions,
			}: {
				command: BotCommandData;
				id: string | null;
				prefix: string;
				botPermissions: PermissionsBitField;
				userPermissions: PermissionsBitField;
			}): void => {
				const name = prefix ? `${prefix} ${command.name}` : command.name;
				const requiredBotPermissions = new PermissionsBitField(botPermissions.bitfield).add(
					...(command.requiredBotPermissions ?? []),
				);
				const requiredUserPermissions = new PermissionsBitField(userPermissions.bitfield).add(
					...(command.defaultMemberPermissions === undefined ? [] : [command.defaultMemberPermissions]),
				);
				entries.push({
					id,
					type: prefix ? "sub-command" : "command",
					name,
					description: command.description,
					category: command.category,
					requiredBotPermissions: requiredBotPermissions.toArray(),
					requiredUserPermissions: requiredUserPermissions.toArray(),
				});
				for (const subcommand of command.subCommands ?? []) {
					addEntry({
						command: subcommand,
						id,
						prefix: name,
						botPermissions: requiredBotPermissions,
						userPermissions: requiredUserPermissions,
					});
				}
			};
			for (const command of getGlobalCommands().values()) {
				addEntry({
					command: command.commandData,
					id: getCommandId(command.commandData.name) ?? null,
					prefix: "",
					botPermissions: new PermissionsBitField(),
					userPermissions: new PermissionsBitField(),
				});
			}
			return response.status(200).json(entries);
		},
	},
];

export default defineRouter("/public", [...publicRoutes, healthRouter]);
