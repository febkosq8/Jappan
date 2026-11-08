import type {
	Guild,
	GuildBasedChannel,
	GuildMember,
	MessageCreateOptions,
	PermissionResolvable,
	PermissionsBitField,
} from "discord.js";
import { ApplicationCommandType, PermissionFlagsBits } from "discord.js";

import { getClient } from "../bot.js";
import GuildModel, { type Guild as StoredGuild, type GuildDocument } from "../models/guild.js";
import { getGuildCommands } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";
import type { LogDetails } from "./logger.js";

export interface GuildDataOptions {
	guildId?: string;
	guildName?: string;
	guild?: Guild;
}

export function getGuildData(guildId: string): Promise<GuildDocument | null> {
	return GuildModel.findOne({ guildId }).exec();
}

export async function getOrCreateGuildData({ guildId, guildName, guild }: GuildDataOptions): Promise<GuildDocument> {
	const resolvedGuildId = guild?.id ?? guildId;
	const resolvedGuildName = guild?.name ?? guildName;
	if (!resolvedGuildId || !resolvedGuildName) {
		throw new Error("Guild ID and guild name are required when guild is not provided");
	}

	let storedGuildData = await getGuildData(resolvedGuildId);
	if (!storedGuildData) {
		storedGuildData = await GuildModel.create({ guildId: resolvedGuildId, guildName: resolvedGuildName });
	}

	if (storedGuildData.guildName !== resolvedGuildName) {
		storedGuildData.guildName = resolvedGuildName;
		await storedGuildData.save();
	}

	return storedGuildData;
}

export function getClientGuild(guildId: string): Guild | undefined {
	return getClient().guilds.cache.get(guildId);
}

export interface GuildState {
	id: string;
	name: string;
	isActiveMember: boolean;
	icon?: string | null;
	memberCount?: Guild["memberCount"];
	channelCount?: number;
	createdAt?: Guild["createdTimestamp"];
	description?: Guild["description"];
	joinedTimestamp?: Guild["joinedTimestamp"];
	systemChannel?: { id: string; name: string } | null;
	permissions?: ReturnType<PermissionsBitField["toArray"]>;
	hasRequiredPermissions?: boolean;
	owner?: { userId: string; avatarUrl: string; username: string };
	guildCommandDeploymentState?: { deployed: number; total: number };
}

export const baseGuildKeys = ["id", "name", "icon"] as const;

export const extendedGuildKeys = [...baseGuildKeys, "hasRequiredPermissions", "owner"] as const;

export const allGuildKeys = [
	...extendedGuildKeys,
	"isActiveMember",
	"memberCount",
	"channelCount",
	"createdAt",
	"description",
	"joinedTimestamp",
	"systemChannel",
	"permissions",
	"guildCommandDeploymentState",
] as const satisfies readonly (keyof GuildState)[];

export async function computeGuildState({
	guildId,
	guildName,
	requiredPermissions,
	keys = allGuildKeys,
}: {
	guildId: string;
	guildName: string;
	requiredPermissions: PermissionsBitField | undefined;
	keys?: readonly (keyof GuildState)[];
}): Promise<Pick<GuildState, "id" | "name"> & Partial<GuildState>> {
	const includeGuildCommandsState = keys.includes("guildCommandDeploymentState");
	const guild = getClientGuild(guildId);
	const returnData: Pick<GuildState, "id" | "name"> & Partial<GuildState> = {
		id: guildId,
		name: guild?.available ? guild.name : guildName,
	};
	if (keys.includes("isActiveMember")) returnData.isActiveMember = guild !== undefined;
	if (!guild || !guild.available) {
		return returnData;
	}
	const botMember =
		keys.includes("permissions") || keys.includes("hasRequiredPermissions")
			? (guild.members.me ?? (await guild.members.fetchMe()))
			: undefined;
	let guildCommandDeploymentState: { deployed: number; total: number } | undefined;
	if (includeGuildCommandsState) {
		const expectedCommands = getGuildCommands();
		const registeredCommands = await guild.commands.fetch();
		guildCommandDeploymentState = {
			deployed: [...expectedCommands.keys()].filter((name) =>
				registeredCommands.some(
					(command) => command.name === name && command.type === ApplicationCommandType.ChatInput,
				),
			).length,
			total: expectedCommands.size,
		};
	}

	if (keys.includes("icon")) returnData.icon = guild.iconURL();
	if (keys.includes("memberCount")) returnData.memberCount = guild.memberCount;
	if (keys.includes("channelCount")) returnData.channelCount = guild.channels.cache.size;
	if (keys.includes("createdAt")) returnData.createdAt = guild.createdTimestamp;
	if (keys.includes("description")) returnData.description = guild.description;
	if (keys.includes("joinedTimestamp")) returnData.joinedTimestamp = guild.joinedTimestamp;
	if (keys.includes("systemChannel") && guild.systemChannel) {
		returnData.systemChannel = { id: guild.systemChannel.id, name: guild.systemChannel.name };
	}
	if (botMember) {
		if (keys.includes("permissions")) returnData.permissions = botMember.permissions.toArray();
		if (keys.includes("hasRequiredPermissions") && requiredPermissions) {
			returnData.hasRequiredPermissions = botMember.permissions.has(requiredPermissions);
		}
	}
	if (keys.includes("owner")) {
		const owner = await guild.client.users.fetch(guild.ownerId);
		returnData.owner = { userId: owner.id, avatarUrl: owner.displayAvatarURL(), username: owner.username };
	}
	if (guildCommandDeploymentState !== undefined) {
		returnData.guildCommandDeploymentState = guildCommandDeploymentState;
	}
	return returnData;
}

export function getGuildDataList(guildIds?: readonly string[]): Promise<Pick<StoredGuild, "guildId" | "guildName">[]> {
	return GuildModel.find(guildIds ? { guildId: { $in: guildIds } } : {})
		.select({ _id: 0, guildId: 1, guildName: 1 })
		.sort({ guildName: 1, guildId: 1 })
		.lean()
		.exec();
}

export function getClientGuilds(): Guild[] {
	return [...getClient().guilds.cache.values()];
}

export async function hasGuildData(guildId: string): Promise<boolean> {
	return (await GuildModel.exists({ guildId })) !== null;
}

const departingGuilds = new WeakSet<Guild>();

export function isActiveGuild(guild: Guild): boolean {
	return guild.available && getClientGuild(guild.id) === guild && !departingGuilds.has(guild);
}

export async function getAdminGuildForAction(guildId: string) {
	if (!(await hasGuildData(guildId))) return { status: "not_found" } as const;

	const guild = getClientGuild(guildId);
	if (!guild) return { status: "not_member" } as const;
	if (!guild.available) return { status: "unavailable" } as const;
	return { status: "ok", guild } as const;
}

export function beginGuildDeparture(guild: Guild): boolean {
	if (!isActiveGuild(guild)) return false;
	departingGuilds.add(guild);
	return true;
}

export function cancelGuildDeparture(guild: Guild): void {
	departingGuilds.delete(guild);
}

export function canSendMessage({
	channel,
	botMember,
	permissions,
}: {
	channel: GuildBasedChannel;
	botMember: GuildMember;
	permissions: PermissionResolvable[];
}): boolean {
	return channel.isTextBased() && (channel.permissionsFor(botMember)?.has(permissions) ?? false);
}

export interface SendGuildMessageOptions {
	guild: Guild;
	content: string | MessageCreateOptions;
	failureMessage: string;
	channelId?: string;
	details?: LogDetails;
}

export interface SentGuildMessage {
	channelId: string;
	channelName: string;
	messageUrl: string;
	messageType: "embed" | "normal";
}

export async function sendGuildMessage({
	guild,
	content,
	failureMessage,
	channelId,
	details,
}: SendGuildMessageOptions): Promise<SentGuildMessage | null> {
	const botMember = await guild.members.fetchMe().catch(() => null);
	const channels = channelId
		? [await guild.channels.fetch(channelId).catch(() => null)]
		: [guild.systemChannel, ...guild.channels.cache.values()];
	const requiresEmbedLinks = typeof content !== "string" && Boolean(content.embeds?.length);
	const messageType = requiresEmbedLinks ? "embed" : "normal";
	const requiredPermissions = [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		...(requiresEmbedLinks ? [PermissionFlagsBits.EmbedLinks] : []),
	];
	for (const channel of channels) {
		if (!channel?.isTextBased()) {
			continue;
		}
		if (botMember && !canSendMessage({ channel, botMember, permissions: requiredPermissions })) {
			continue;
		}

		try {
			const sentMessage = await channel.send(content);
			return {
				channelId: channel.id,
				channelName: channel.name ?? "unknown",
				messageUrl: sentMessage.url,
				messageType,
			};
		} catch (error: unknown) {
			logger.error("DISCORD", failureMessage, {
				...details,
				guildId: guild.id,
				channelId: channel.id,
				error,
			});
		}
	}

	return null;
}
