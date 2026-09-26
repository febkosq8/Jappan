import {
	EmbedBuilder,
	PermissionFlagsBits,
	channelMention,
	chatInputApplicationCommandMention,
	userMention,
} from "discord.js";
import type { Guild, GuildMember, PartialGuildMember } from "discord.js";

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
	const guild = await getGuildSettings(guildId, guildName);
	if (event === "join" || event === "both") {
		guild.memberAnnouncements.joinEnabled = enabled;
		guild.memberAnnouncements.joinChannelId = enabled ? (channelId ?? null) : null;
	}
	if (event === "leave" || event === "both") {
		guild.memberAnnouncements.leaveEnabled = enabled;
		guild.memberAnnouncements.leaveChannelId = enabled ? (channelId ?? null) : null;
	}

	return guild.save();
}

export async function getMemberAnnouncementStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings(guildId, guildName);
}

async function disableAnnouncement(guild: Guild, event: "join" | "leave", channelId: string): Promise<void> {
	const settings = await getMemberAnnouncementStatus(guild.id, guild.name);
	if (event === "join") {
		settings.memberAnnouncements.joinEnabled = false;
		settings.memberAnnouncements.joinChannelId = null;
	} else {
		settings.memberAnnouncements.leaveEnabled = false;
		settings.memberAnnouncements.leaveChannelId = null;
	}
	await settings.save();
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
				`⚠️ Member ${event === "join" ? "join" : "leave"} announcements were automatically disabled because I can no longer access ${channelMention(channelId)}. Please configure a new channel with ${commandMention}.`,
			);
			return;
		} catch (error: unknown) {
			logger.error("DISCORD", "Failed to notify guild about disabled member announcements", {
				guildId: guild.id,
				channelId: fallbackChannel.id,
				event,
				error,
			});
		}
	}
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
		const settings = await getMemberAnnouncementStatus(member.guild.id, member.guild.name);
		if (!settings.memberAnnouncements.joinEnabled) {
			return;
		}
		await postAnnouncement(member, "join", settings.memberAnnouncements.joinChannelId, config);
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
		const settings = await getMemberAnnouncementStatus(member.guild.id, member.guild.name);
		if (!settings.memberAnnouncements.leaveEnabled) {
			return;
		}
		await postAnnouncement(member, "leave", settings.memberAnnouncements.leaveChannelId, config);
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to load member leave announcement settings", {
			member,
			guildId: member.guild.id,
			error,
		});
	}
}
