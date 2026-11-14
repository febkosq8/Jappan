import { ApplicationCommandOptionType, ChannelType, PermissionsBitField } from "discord.js";
import { z } from "zod";

import { getClient } from "../../bot.js";
import { getClientGuilds } from "../../helpers/guild.js";
import { defineRouter, errorResponseSchema } from "../../helpers/route.js";
import type { RouteDefinition } from "../../helpers/route.js";
import {
	filterListByQuery,
	listQueryParameters,
	listQuerySchema,
	paginateList,
	paginatedListSchema,
	parseListQuery,
} from "../../helpers/list.js";
import { getBotVersion } from "../../helpers/utils.js";
import { getCommandId, getGlobalCommands, type BotCommand, type BotCommandData } from "../../services/commandLoader.js";
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

const commandOptionSchema = z.object({
	name: z.string(),
	description: z.string(),
	type: z.string(),
	required: z.boolean(),
	autocomplete: z.boolean(),
	choices: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]) })),
	channelTypes: z.array(z.string()),
	minValue: z.number().nullable(),
	maxValue: z.number().nullable(),
	minLength: z.number().nullable(),
	maxLength: z.number().nullable(),
});

const detailedCommandSchema = commandSchema.extend({
	options: z.array(commandOptionSchema),
	usageNotes: z.array(z.string()),
});

type CommandOption = NonNullable<ReturnType<BotCommand["data"]["toJSON"]>["options"]>[number];

function getPublicCommandEntries(command: BotCommand): z.infer<typeof detailedCommandSchema>[] {
	const entries: z.infer<typeof detailedCommandSchema>[] = [];
	const definition = command.data.toJSON();
	const id = getCommandId(definition.name) ?? null;
	const addEntry = ({
		definition,
		metadata,
		prefix,
		botPermissions,
		userPermissions,
	}: {
		definition: { name: string; description: string; options?: readonly CommandOption[] | undefined };
		metadata: BotCommandData;
		prefix: string;
		botPermissions: PermissionsBitField;
		userPermissions: PermissionsBitField;
	}): void => {
		const name = prefix ? `${prefix} ${definition.name}` : definition.name;
		const requiredBotPermissions = new PermissionsBitField(botPermissions.bitfield).add(
			...(metadata.requiredBotPermissions ?? []),
		);
		const requiredUserPermissions = new PermissionsBitField(userPermissions.bitfield).add(
			...(metadata.defaultMemberPermissions === undefined ? [] : [metadata.defaultMemberPermissions]),
		);
		const options = definition.options ?? [];
		entries.push({
			id,
			type: prefix ? "sub-command" : "command",
			name,
			description: metadata.description,
			category: metadata.category,
			requiredBotPermissions: requiredBotPermissions.toArray(),
			requiredUserPermissions: requiredUserPermissions.toArray(),
			usageNotes: [...(metadata.usageNotes ?? [])],
			options: options.flatMap((option) => {
				if (
					option.type === ApplicationCommandOptionType.Subcommand ||
					option.type === ApplicationCommandOptionType.SubcommandGroup
				)
					return [];
				return [
					{
						name: option.name,
						description: option.description,
						type: ApplicationCommandOptionType[option.type],
						required: option.required ?? false,
						autocomplete: "autocomplete" in option && option.autocomplete === true,
						choices:
							"choices" in option
								? (option.choices ?? []).map(({ name, value }) => ({ name, value }))
								: [],
						channelTypes:
							"channel_types" in option
								? (option.channel_types ?? []).map((type) => ChannelType[type])
								: [],
						minValue: "min_value" in option ? (option.min_value ?? null) : null,
						maxValue: "max_value" in option ? (option.max_value ?? null) : null,
						minLength: "min_length" in option ? (option.min_length ?? null) : null,
						maxLength: "max_length" in option ? (option.max_length ?? null) : null,
					},
				];
			}),
		});
		for (const option of options) {
			if (
				option.type !== ApplicationCommandOptionType.Subcommand &&
				option.type !== ApplicationCommandOptionType.SubcommandGroup
			)
				continue;
			const childMetadata = metadata.subCommands?.find((child) => child.name === option.name) ?? metadata;
			addEntry({
				definition: option,
				metadata: childMetadata,
				prefix: name,
				botPermissions: requiredBotPermissions,
				userPermissions: requiredUserPermissions,
			});
		}
	};
	addEntry({
		definition,
		metadata: command.commandData,
		prefix: "",
		botPermissions: new PermissionsBitField(),
		userPermissions: new PermissionsBitField(),
	});
	return entries;
}

const botStatusSchema = z.object({
	botName: z.string(),
	botAvatarUrl: z.string().url(),
	botId: z.string().nullable(),
	version: z.string(),
	bootedTimestampMs: z.number(),
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
			const guilds = getClientGuilds();
			const gatewayLatency = client.ws.ping;
			const returnData = {
				botName: botUser.username,
				botAvatarUrl: botUser.displayAvatarURL(),
				botId: botUser.id,
				version: getBotVersion(),
				bootedTimestampMs: Date.now() - Math.floor(process.uptime() * 1000),
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
		parameters: listQueryParameters,
		responses: {
			200: {
				description: "Global command definitions, options, and declared permissions",
				schema: paginatedListSchema(detailedCommandSchema),
			},
			400: { description: "Invalid list query", schema: errorResponseSchema },
			500: { description: "Failed to list commands", schema: errorResponseSchema },
		},
		handler: (request, response) => {
			const query = parseListQuery(request.query, listQuerySchema, response);
			if (!query) return;
			const entries = Array.from(getGlobalCommands().values()).flatMap(getPublicCommandEntries);
			const filtered = filterListByQuery({
				items: entries,
				query: query.query,
				fieldFilters: query.fieldFilters,
				searchableFields: {
					id: (entry) => entry.id,
					type: (entry) => entry.type,
					name: (entry) => entry.name,
					description: (entry) => entry.description,
					category: (entry) => entry.category,
					requiredBotPermissions: (entry) => entry.requiredBotPermissions.join(" "),
					requiredUserPermissions: (entry) => entry.requiredUserPermissions.join(" "),
					"options.name": (entry) => entry.options.map((option) => option.name).join(" "),
					"options.description": (entry) => entry.options.map((option) => option.description).join(" "),
					"options.type": (entry) => entry.options.map((option) => option.type).join(" "),
					"options.required": (entry) => entry.options.map((option) => String(option.required)).join(" "),
					"options.autocomplete": (entry) =>
						entry.options.map((option) => String(option.autocomplete)).join(" "),
					"options.choices.name": (entry) =>
						entry.options.flatMap((option) => option.choices.map((choice) => choice.name)).join(" "),
					"options.choices.value": (entry) =>
						entry.options
							.flatMap((option) => option.choices.map((choice) => String(choice.value)))
							.join(" "),
					"options.channelTypes": (entry) => entry.options.flatMap((option) => option.channelTypes).join(" "),
					"options.minValue": (entry) =>
						entry.options.map((option) => String(option.minValue ?? "")).join(" "),
					"options.maxValue": (entry) =>
						entry.options.map((option) => String(option.maxValue ?? "")).join(" "),
					"options.minLength": (entry) =>
						entry.options.map((option) => String(option.minLength ?? "")).join(" "),
					"options.maxLength": (entry) =>
						entry.options.map((option) => String(option.maxLength ?? "")).join(" "),
					usageNotes: (entry) => entry.usageNotes.join(" "),
				},
				response,
			});
			if (!filtered) return;
			return response
				.status(200)
				.json(paginateList({ items: filtered, page: query.page, perPageLimit: query.perPageLimit }));
		},
	},
];

export default defineRouter("/public", [...publicRoutes, healthRouter]);
