import { EmbedBuilder, userMention } from "discord.js";
import type { GuildMember, PartialGuildMember } from "discord.js";

import type { GuildDocument } from "../models/guild.js";
import type { Config } from "./config.js";
import { getGuildSettings } from "./guild.js";
import { logger } from "./logger.js";

export type MemberAnnouncementEvent = "in" | "out" | "both";

export async function setMemberAnnouncement(
	guildId: string,
	guildName: string,
	event: MemberAnnouncementEvent,
	enabled: boolean,
	channelId?: string,
): Promise<GuildDocument> {
	const guild = await getGuildSettings(guildId, guildName);
	if (event === "in" || event === "both") {
		guild.memberAnnouncements.joinEnabled = enabled;
		guild.memberAnnouncements.joinChannelId = enabled ? (channelId ?? null) : null;
	}
	if (event === "out" || event === "both") {
		guild.memberAnnouncements.leaveEnabled = enabled;
		guild.memberAnnouncements.leaveChannelId = enabled ? (channelId ?? null) : null;
	}

	return guild.save();
}

export async function getMemberAnnouncementStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings(guildId, guildName);
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
			logger.warn("DISCORD", "Member announcement channel is unavailable", {
				guildId: member.guild.id,
				channelId,
				event,
			});
			return;
		}

		await channel.send({
			embeds: [
				new EmbedBuilder()
					.setColor(event === "join" ? "Green" : "Red")
					.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle(event === "join" ? "Member Joined" : "Member Left")
					.setDescription(`${userMention(member.user.id)} ${event === "join" ? "joined" : "left"} the server.`)
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
