import type { Guild, GuildBasedChannel, GuildMember, PartialGuildMember } from "discord.js";
import { EmbedBuilder, channelMention, chatInputApplicationCommandMention, userMention } from "discord.js";

import { formatUserMention } from "../helpers/discord.js";
import { isActiveGuild, sendGuildMessage } from "../helpers/guild.js";
import type { GuildDocument } from "../models/guild.js";
import { getCommandId } from "./commandLoader.js";
import { getConfig } from "./config.js";
import { getGuildSettings } from "./guild.js";
import { logger } from "./logger.js";

export type MemberAnnouncementEvent = "join" | "leave" | "both";

export async function setMemberAnnouncement({
	guildId,
	guildName,
	event,
	enabled,
	channelId,
}: {
	guildId: string;
	guildName: string;
	event: MemberAnnouncementEvent;
	enabled: boolean;
	channelId?: string;
}): Promise<GuildDocument> {
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
		if (!isActiveGuild(guild)) break;
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
			if (await disableAnnouncement({ guild, event, channelId })) {
				storedGuildSettingsData.memberAnnouncements[announcement.enabled] = false;
				storedGuildSettingsData.memberAnnouncements[announcement.channel] = null;
			}
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

async function disableAnnouncement({
	guild,
	event,
	channelId,
}: {
	guild: Guild;
	event: "join" | "leave";
	channelId: string;
}): Promise<boolean> {
	if (!isActiveGuild(guild)) return false;
	const storedGuildSettingsData = await getGuildSettings({ guild });
	if (!isActiveGuild(guild)) return false;
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

	const commandId = getCommandId("memberannounce");
	const commandMention = commandId
		? chatInputApplicationCommandMention("memberannounce", "on", commandId)
		: "the command menu";
	await sendGuildMessage({
		guild,
		content: `⚠️ Member ${event === "join" ? "join" : "leave"} announcements were automatically disabled because I can no longer access ${channelMention(channelId)} (channel ID: \`${channelId}\`).\n📢 PSA for admins: please configure a new channel with ${commandMention}.`,
		failureMessage: "Failed to notify guild about disabled member announcements",
		details: { channelId, event },
	});

	return true;
}

async function postAnnouncement({
	member,
	event,
	channelId,
}: {
	member: GuildMember | PartialGuildMember;
	event: "join" | "leave";
	channelId: string | null | undefined;
}): Promise<void> {
	if (!channelId || !isActiveGuild(member.guild)) {
		return;
	}

	try {
		const channel = await member.guild.channels.fetch(channelId);
		if (!isActiveGuild(member.guild)) return;
		if (!channel?.isTextBased()) {
			await disableAnnouncement({ guild: member.guild, event, channelId });
			return;
		}
		const config = getConfig();

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
						{ name: "User", value: formatUserMention(member.user), inline: true },
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
			allowedMentions: { parse: [] },
		});
	} catch (error: unknown) {
		if (!isActiveGuild(member.guild)) return;
		if (isUnavailableChannelError(error)) {
			try {
				await disableAnnouncement({ guild: member.guild, event, channelId });
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

export async function handleMemberJoinAnnouncement(member: GuildMember | PartialGuildMember): Promise<void> {
	if (!isActiveGuild(member.guild) || member.id === member.guild.client.user?.id) return;
	try {
		const memberAnnouncements = await getMemberAnnouncementStatus(member.guild);
		if (!isActiveGuild(member.guild) || !memberAnnouncements.joinEnabled) {
			return;
		}
		await postAnnouncement({ member, event: "join", channelId: memberAnnouncements.joinChannelId });
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to load member join announcement settings", {
			member,
			guildId: member.guild.id,
			error,
		});
	}
}

export async function handleMemberLeaveAnnouncement(member: GuildMember | PartialGuildMember): Promise<void> {
	if (!isActiveGuild(member.guild) || member.id === member.guild.client.user?.id) return;
	try {
		const memberAnnouncements = await getMemberAnnouncementStatus(member.guild);
		if (!isActiveGuild(member.guild) || !memberAnnouncements.leaveEnabled) {
			return;
		}
		await postAnnouncement({ member, event: "leave", channelId: memberAnnouncements.leaveChannelId });
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to load member leave announcement settings", {
			member,
			guildId: member.guild.id,
			error,
		});
	}
}
