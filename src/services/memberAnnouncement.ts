import {
	EmbedBuilder,
	PermissionFlagsBits,
	channelMention,
	chatInputApplicationCommandMention,
	userMention,
} from "discord.js";
import type { Guild, GuildBasedChannel, GuildMember, PartialGuildMember } from "discord.js";

import type { GuildDocument } from "../models/guild.js";
import { getCommandId } from "./commandLoader.js";
import type { Config } from "./config.js";
import { getGuildSettings } from "./guild.js";
import { logger } from "./logger.js";

export type MemberAnnouncementEvent = "join" | "leave" | "both";

export async function setMemberAnnouncement(
	guildId: string,
	guildName: string,
	event: MemberAnnouncementEvent,
	enabled: boolean,
	channelId?: string,
): Promise<GuildDocument> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	if (event === "join" || event === "both") {
		storedGuildData.memberAnnouncements.joinEnabled = enabled;
		storedGuildData.memberAnnouncements.joinChannelId = enabled ? (channelId ?? null) : null;
	}
	if (event === "leave" || event === "both") {
		storedGuildData.memberAnnouncements.leaveEnabled = enabled;
		storedGuildData.memberAnnouncements.leaveChannelId = enabled ? (channelId ?? null) : null;
	}

	return storedGuildData.save();
}

export async function getMemberAnnouncementStatus(guild: Guild): Promise<GuildDocument["memberAnnouncements"]> {
	const storedGuildSettingsData = await getGuildSettings({ guild });

	for (const announcement of [
		{ enabled: "joinEnabled", channel: "joinChannelId" },
		{ enabled: "leaveEnabled", channel: "leaveChannelId" },
	] as const) {
		const channelId = storedGuildSettingsData.memberAnnouncements[announcement.channel];
		if (!storedGuildSettingsData.memberAnnouncements[announcement.enabled] || !channelId) {
			continue;
		}

		let channel: GuildBasedChannel | null;
		try {
			channel = await guild.channels.fetch(channelId);
		} catch (error: unknown) {
			if (!isUnavailableChannelError(error)) {
				throw error;
			}
			channel = null;
		}

		if (!channel?.isTextBased()) {
			const event = announcement.enabled === "joinEnabled" ? "join" : "leave";
			await disableAnnouncement(guild, event, channelId);
			storedGuildSettingsData.memberAnnouncements[announcement.enabled] = false;
			storedGuildSettingsData.memberAnnouncements[announcement.channel] = null;
		}
	}

	return storedGuildSettingsData.memberAnnouncements;
}

function isUnavailableChannelError(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return false;
	}

	const code = (error as { code?: unknown }).code;
	return code === 10003 || code === 50001 || code === 50013;
}

async function disableAnnouncement(
	guild: Guild,
	event: "join" | "leave",
	channelId: string,
): Promise<GuildDocument["memberAnnouncements"]> {
	const storedGuildSettingsData = await getGuildSettings({ guild });
	if (event === "join") {
		storedGuildSettingsData.memberAnnouncements.joinEnabled = false;
		storedGuildSettingsData.memberAnnouncements.joinChannelId = null;
	} else {
		storedGuildSettingsData.memberAnnouncements.leaveEnabled = false;
		storedGuildSettingsData.memberAnnouncements.leaveChannelId = null;
	}
	await storedGuildSettingsData.save();
	logger.warn("DISCORD", "Member announcement disabled because its channel is unavailable", {
		guildId: guild.id,
		channelId,
		event,
	});

	const botMember = await guild.members.fetchMe().catch(() => null);
	const channels = [guild.systemChannel, ...guild.channels.cache.values()];
	for (const fallbackChannel of channels) {
		if (
			!fallbackChannel?.isTextBased() ||
			(botMember &&
				!fallbackChannel
					.permissionsFor(botMember)
					?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]))
		) {
			continue;
		}

		try {
			const commandId = getCommandId("memberannounce");
			const commandMention = commandId
				? chatInputApplicationCommandMention("memberannounce", "on", commandId)
				: "`/memberannounce on`";
			await fallbackChannel.send(
				`⚠️ Member ${event === "join" ? "join" : "leave"} announcements were automatically disabled because I can no longer access ${channelMention(channelId)} (channel ID: \`${channelId}\`).\n📣 PSA for admins: please configure a new channel with ${commandMention}.`,
			);
			return storedGuildSettingsData.memberAnnouncements;
		} catch (error: unknown) {
			logger.error("DISCORD", "Failed to notify guild about disabled member announcements", {
				guildId: guild.id,
				channelId: fallbackChannel.id,
				event,
				error,
			});
		}
	}

	return storedGuildSettingsData.memberAnnouncements;
}

async function postAnnouncement(
	member: GuildMember | PartialGuildMember,
	event: "join" | "leave",
	channelId: string | null | undefined,
	config: Config,
): Promise<void> {
	if (!channelId) {
		return;
	}

	try {
		const channel = await member.guild.channels.fetch(channelId);
		if (!channel?.isTextBased()) {
			await disableAnnouncement(member.guild, event, channelId);
			return;
		}

		await channel.send({
			embeds: [
				new EmbedBuilder()
					.setColor(event === "join" ? "Green" : "Red")
					.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle(event === "join" ? "New Member" : "Member Departed")
					.setDescription(
						event === "join"
							? `🎉 Welcome, ${userMention(member.user.id)}! Glad to have you here.`
							: `👋 ${userMention(member.user.id)} has left the server. We wish them well!`,
					)
					.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
					.addFields(
						{ name: "User", value: userMention(member.user.id), inline: true },
						...(event === "leave" && member.joinedTimestamp
							? [
									{
										name: "Joined At",
										value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`,
										inline: true,
									},
								]
							: []),
					)
					.setFooter({ text: `User ID: ${member.user.id}` })
					.setTimestamp(),
			],
		});
	} catch (error: unknown) {
		if (isUnavailableChannelError(error)) {
			try {
				await disableAnnouncement(member.guild, event, channelId);
			} catch (disableError: unknown) {
				logger.error("DISCORD", "Failed to disable unavailable member announcement channel", {
					member,
					guildId: member.guild.id,
					channelId,
					event,
					error: disableError,
				});
			}
		}
		logger.error("DISCORD", "Failed to post member announcement", {
			member,
			guildId: member.guild.id,
			channelId,
			event,
			error,
		});
	}
}

export async function handleMemberJoinAnnouncement(
	member: GuildMember | PartialGuildMember,
	config: Config,
): Promise<void> {
	try {
		const memberAnnouncements = await getMemberAnnouncementStatus(member.guild);
		if (!memberAnnouncements.joinEnabled) {
			return;
		}
		await postAnnouncement(member, "join", memberAnnouncements.joinChannelId, config);
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to load member join announcement settings", {
			member,
			guildId: member.guild.id,
			error,
		});
	}
}

export async function handleMemberLeaveAnnouncement(
	member: GuildMember | PartialGuildMember,
	config: Config,
): Promise<void> {
	try {
		const memberAnnouncements = await getMemberAnnouncementStatus(member.guild);
		if (!memberAnnouncements.leaveEnabled) {
			return;
		}
		await postAnnouncement(member, "leave", memberAnnouncements.leaveChannelId, config);
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to load member leave announcement settings", {
			member,
			guildId: member.guild.id,
			error,
		});
	}
}
