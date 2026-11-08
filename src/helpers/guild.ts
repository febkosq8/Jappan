import type { Guild, GuildBasedChannel, GuildMember, MessageCreateOptions, PermissionResolvable } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

import { getClient } from "../bot.js";
import GuildModel, { type Guild as StoredGuild, type GuildDocument } from "../models/guild.js";
import { logger } from "../services/logger.js";
import type { LogDetails } from "./logger.js";

export type GuildSource = "database" | "discord";

export function getGuild(options: { source: "database"; guildId: string }): Promise<GuildDocument | null>;
export function getGuild(options: { source: "discord"; guildId: string }): Guild | undefined;
export function getGuild({
	source,
	guildId,
}: {
	source: GuildSource;
	guildId: string;
}): Promise<GuildDocument | null> | Guild | undefined {
	if (source === "database") {
		return GuildModel.findOne({ guildId }).exec();
	}
	return getClient().guilds.cache.get(guildId);
}

export function getGuilds(options: { source: "discord" }): Guild[];
export function getGuilds({
	source,
	guildIds,
}: {
	source: "database";
	guildIds?: readonly string[];
}): Promise<Pick<StoredGuild, "guildId" | "guildName">[]>;
export function getGuilds({
	source,
	guildIds,
}: {
	source: GuildSource;
	guildIds?: readonly string[];
}): Promise<Pick<StoredGuild, "guildId" | "guildName">[]> | Guild[] {
	if (source === "database") {
		return GuildModel.find(guildIds ? { guildId: { $in: guildIds } } : {})
			.select({ _id: 0, guildId: 1, guildName: 1 })
			.sort({ guildName: 1, guildId: 1 })
			.lean()
			.exec();
	}
	return [...getClient().guilds.cache.values()];
}

const departingGuilds = new WeakSet<Guild>();

export function isActiveGuild(guild: Guild): boolean {
	return (
		guild.available && getGuild({ source: "discord", guildId: guild.id }) === guild && !departingGuilds.has(guild)
	);
}

export async function getAdminGuildForAction(guildId: string) {
	const storedGuild = await getGuild({ source: "database", guildId });
	if (!storedGuild) return { status: "not_found" } as const;

	const guild = getGuild({ source: "discord", guildId });
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
