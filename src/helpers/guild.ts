import type {
	Guild,
	GuildBasedChannel,
	GuildMember,
	MessageCreateOptions,
	PermissionResolvable,
	PermissionsBitField,
} from "discord.js";
import { ApplicationCommandType, DiscordAPIError, PermissionFlagsBits } from "discord.js";

import { getClient } from "../bot.js";
import GuildModel, { type Guild as StoredGuild, type GuildDocument } from "../models/guild.js";
import { getGuildCommands, getRequiredGlobalBotPermissions } from "../services/commandLoader.js";
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

async function getPreferenceChannel(guild: Guild | undefined, channelId: string) {
	if (!guild?.available) return { id: channelId, name: null };

	try {
		const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId));
		return { id: channelId, name: channel?.guildId === guild.id ? channel.name : null };
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && [10003, 50001, 50013].includes(Number(error.code))) {
			return { id: channelId, name: null };
		}
		throw error;
	}
}

async function getPreferenceRole(guild: Guild | undefined, roleId: string | null | undefined) {
	if (!roleId) return null;
	if (!guild?.available) return { id: roleId, name: null };

	try {
		const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId));
		return { id: roleId, name: role?.name ?? null };
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && [10011, 50001, 50013].includes(Number(error.code))) {
			return { id: roleId, name: null };
		}
		throw error;
	}
}

type StoredServicePreferences = Pick<StoredGuild, "auditLog" | "leveling" | "memberAnnouncements" | "warnings">;

async function resolveServicePreferences(guild: Guild | undefined, storedGuild: StoredServicePreferences) {
	const channelIds = [
		storedGuild.auditLog.channelId,
		storedGuild.memberAnnouncements.joinChannelId,
		storedGuild.memberAnnouncements.leaveChannelId,
		storedGuild.warnings.auditChannelId,
	];
	const channels = new Map<string, Awaited<ReturnType<typeof getPreferenceChannel>>>();
	for (const id of new Set(channelIds.filter((id): id is string => !!id))) {
		channels.set(id, await getPreferenceChannel(guild, id));
	}
	const channelFor = (id: string | null | undefined) => {
		if (!id) return null;
		const channel = channels.get(id);
		if (!channel) throw new Error(`Failed to resolve preference channel ${id}`);
		return channel;
	};
	return {
		auditLog: {
			enabled: storedGuild.auditLog.enabled,
			channel: channelFor(storedGuild.auditLog.channelId),
			fullVerbosity: storedGuild.auditLog.fullVerbosity,
		},
		leveling: {
			enabled: storedGuild.leveling.enabled,
			threshold: storedGuild.leveling.threshold ?? null,
			role: await getPreferenceRole(guild, storedGuild.leveling.roleId),
		},
		memberAnnouncements: {
			joinEnabled: storedGuild.memberAnnouncements.joinEnabled,
			leaveEnabled: storedGuild.memberAnnouncements.leaveEnabled,
			joinChannel: channelFor(storedGuild.memberAnnouncements.joinChannelId),
			leaveChannel: channelFor(storedGuild.memberAnnouncements.leaveChannelId),
		},
		warnings: {
			timeoutThreshold: storedGuild.warnings.timeoutThreshold ?? null,
			timeoutDurationHours: storedGuild.warnings.timeoutDurationHours ?? null,
			banThreshold: storedGuild.warnings.banThreshold ?? null,
			auditChannel: channelFor(storedGuild.warnings.auditChannelId),
		},
	};
}

export interface GuildState {
	id: string;
	name: string;
	isActiveMember: boolean;
	icon?: string | null;
	memberCount?: Guild["memberCount"];
	channelCount?: number;
	createdTimestampMs?: Guild["createdTimestamp"];
	description?: Guild["description"];
	joinedTimestampMs?: Guild["joinedTimestamp"];
	systemChannel?: { id: string; name: string } | null;
	permissions?: ReturnType<PermissionsBitField["toArray"]>;
	hasRequiredPermissions?: boolean;
	owner?: { userId: string; avatarUrl: string; username: string };
	guildCommandDeploymentState?: { deployed: number; total: number };
	discoveredTimestampMs?: number | null;
	servicePreferences?: Awaited<ReturnType<typeof resolveServicePreferences>>;
}

export const baseGuildKeys = ["id", "name", "icon"] as const;

export const extendedGuildKeys = [...baseGuildKeys, "hasRequiredPermissions", "owner"] as const;

export const allGuildKeys = [
	...extendedGuildKeys,
	"isActiveMember",
	"memberCount",
	"channelCount",
	"createdTimestampMs",
	"description",
	"joinedTimestampMs",
	"systemChannel",
	"permissions",
	"guildCommandDeploymentState",
	"discoveredTimestampMs",
	"servicePreferences",
] as const satisfies readonly (keyof GuildState)[];

type StoredGuildState = Pick<StoredGuild, "guildId" | "guildName"> &
	Partial<Pick<StoredGuild, "createdAt" | keyof StoredServicePreferences>>;

type ComputedGuildState = Pick<GuildState, "id" | "name"> & Partial<GuildState>;

type ComputeGuildStateOptions = {
	requiredPermissions?: PermissionsBitField | undefined;
	keys?: readonly (keyof GuildState)[];
};

type GuildStateSource =
	| { guildData: StoredGuildState; clientGuild?: never; guildId?: never }
	| { clientGuild: Guild; guildData?: never; guildId?: never }
	| { guildId: string; guildData?: never; clientGuild?: never };

export function getGuildState(
	options: ComputeGuildStateOptions & { clientGuild: Guild; guildData?: never; guildId?: never },
): Promise<ComputedGuildState | null>;
export function getGuildState(
	options: ComputeGuildStateOptions & { guildId: string; guildData?: never; clientGuild?: never },
): Promise<ComputedGuildState | null>;
export function getGuildState(
	options: ComputeGuildStateOptions & { guildData: StoredGuildState; clientGuild?: never; guildId?: never },
): Promise<ComputedGuildState>;
export async function getGuildState(
	options: ComputeGuildStateOptions & GuildStateSource,
): Promise<ComputedGuildState | null> {
	const { requiredPermissions, keys = allGuildKeys } = options;
	const guildId = options.guildData
		? options.guildData.guildId
		: options.clientGuild
			? options.clientGuild.id
			: options.guildId;
	const storedGuild = options.guildData ?? (await getGuildData(guildId));
	if (!storedGuild) return null;
	const guild = options.clientGuild ?? getClientGuild(guildId);
	const returnData: Pick<GuildState, "id" | "name"> & Partial<GuildState> = {
		id: storedGuild.guildId,
		name: guild?.available ? guild.name : storedGuild.guildName,
	};
	if (keys.includes("isActiveMember")) returnData.isActiveMember = guild !== undefined;
	if (keys.includes("discoveredTimestampMs"))
		returnData.discoveredTimestampMs = storedGuild.createdAt?.getTime() ?? null;
	if (keys.includes("servicePreferences")) {
		const { auditLog, leveling, memberAnnouncements, warnings } = storedGuild;
		if (!auditLog || !leveling || !memberAnnouncements || !warnings) {
			throw new Error(`Stored preferences are required for guild ${storedGuild.guildId}`);
		}
		returnData.servicePreferences = await resolveServicePreferences(guild, {
			auditLog,
			leveling,
			memberAnnouncements,
			warnings,
		});
	}
	if (!guild || !guild.available) {
		return returnData;
	}
	const botMember =
		keys.includes("permissions") || keys.includes("hasRequiredPermissions")
			? (guild.members.me ?? (await guild.members.fetchMe()))
			: undefined;

	if (keys.includes("icon")) returnData.icon = guild.iconURL();
	if (keys.includes("memberCount")) returnData.memberCount = guild.memberCount;
	if (keys.includes("channelCount")) returnData.channelCount = guild.channels.cache.size;
	if (keys.includes("owner")) {
		const owner = await guild.client.users.fetch(guild.ownerId);
		returnData.owner = { userId: owner.id, avatarUrl: owner.displayAvatarURL(), username: owner.username };
	}
	if (keys.includes("createdTimestampMs")) returnData.createdTimestampMs = guild.createdTimestamp;
	if (keys.includes("description")) returnData.description = guild.description;
	if (keys.includes("joinedTimestampMs")) returnData.joinedTimestampMs = guild.joinedTimestamp;
	if (keys.includes("systemChannel") && guild.systemChannel) {
		returnData.systemChannel = { id: guild.systemChannel.id, name: guild.systemChannel.name };
	}
	if (keys.includes("guildCommandDeploymentState")) {
		const expectedCommands = getGuildCommands();
		const registeredCommands = await guild.commands.fetch();
		returnData.guildCommandDeploymentState = {
			deployed: [...expectedCommands.keys()].filter((name) =>
				registeredCommands.some(
					(command) => command.name === name && command.type === ApplicationCommandType.ChatInput,
				),
			).length,
			total: expectedCommands.size,
		};
	}
	if (botMember) {
		if (keys.includes("permissions")) returnData.permissions = botMember.permissions.toArray();
		if (keys.includes("hasRequiredPermissions")) {
			returnData.hasRequiredPermissions = botMember.permissions.has(
				requiredPermissions ?? getRequiredGlobalBotPermissions(),
			);
		}
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
