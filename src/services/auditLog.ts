import { EmbedBuilder, PermissionFlagsBits, userMention } from "discord.js";
import type { Guild, GuildMember, Message, PartialGuildMember, PartialMessage, VoiceState } from "discord.js";

import { sendGuildMessage } from "../helpers/guildHelper.js";
import type { GuildDocument } from "../models/guild.js";
import { getGuildSettings } from "./guild.js";
import { logger } from "./logger.js";

export interface AuditLogStatus {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly auditLog: GuildDocument["auditLog"];
}

export async function setAuditLog(
	guildId: string,
	guildName: string,
	enabled: boolean,
	channelId: string | null,
	fullVerbosity: boolean,
): Promise<AuditLogStatus> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	storedGuildData.auditLog.enabled = enabled;
	storedGuildData.auditLog.channelId = channelId;
	storedGuildData.auditLog.fullVerbosity = enabled && fullVerbosity;
	await storedGuildData.save();
	return {
		guildId: storedGuildData.guildId,
		guildName: storedGuildData.guildName,
		auditLog: storedGuildData.auditLog,
	};
}

export async function getAuditLogStatus(guildId: string, guildName: string): Promise<AuditLogStatus> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	return {
		guildId: storedGuildData.guildId,
		guildName: storedGuildData.guildName,
		auditLog: storedGuildData.auditLog,
	};
}

async function postAuditEvent(guild: Guild, embed: EmbedBuilder): Promise<void> {
	const storedGuildData = await getGuildSettings({ guild });
	if (!storedGuildData.auditLog.enabled || !storedGuildData.auditLog.channelId) {
		return;
	}

	const channelId = storedGuildData.auditLog.channelId;
	const channel = await guild.channels.fetch(channelId).catch(() => null);
	const botMember = await guild.members.fetchMe().catch(() => null);
	if (
		!channel?.isTextBased() ||
		!channel.isSendable() ||
		!botMember?.permissionsIn(channel).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
	) {
		await disableAuditLog(guild, channelId);
		return;
	}

	await channel.send({ embeds: [embed] });
}

async function disableAuditLog(guild: Guild, channelId: string): Promise<void> {
	const storedGuildData = await getGuildSettings({ guild });
	storedGuildData.auditLog.enabled = false;
	storedGuildData.auditLog.channelId = null;
	storedGuildData.auditLog.fullVerbosity = false;
	await storedGuildData.save();
	logger.warn("DISCORD", "Audit logging disabled because its channel is unavailable", {
		guildId: guild.id,
		channelId,
	});
	await sendGuildMessage({
		guild,
		content: `⚠️ Audit logging was automatically disabled because I can no longer access the configured audit channel.\n📢 PSA for admins: please configure a new audit channel with \`/auditlog on\`.`,
		failureMessage: "Failed to notify guild about disabled audit logging",
		details: { channelId },
	});
}

export async function handleAuditMemberAdd(member: GuildMember): Promise<void> {
	await postAuditEvent(
		member.guild,
		new EmbedBuilder()
			.setColor("Green")
			.setTitle("Audit Event: Member Joined")
			.setDescription(`${userMention(member.id)} joined the server.`)
			.addFields({ name: "User", value: `${userMention(member.id)} (${member.user.tag})` })
			.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
			.setTimestamp(),
	);
}

export async function handleAuditMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
	await postAuditEvent(
		member.guild,
		new EmbedBuilder()
			.setColor("Red")
			.setTitle("Audit Event: Member Left")
			.setDescription(`${userMention(member.id)} left the server.`)
			.addFields({ name: "User", value: `${userMention(member.id)} (${member.user.tag})` })
			.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
			.setTimestamp(),
	);
}

export async function handleAuditMessageDelete(message: Message | PartialMessage): Promise<void> {
	if (!message.guild || message.partial) {
		return;
	}

	await postAuditEvent(
		message.guild,
		new EmbedBuilder()
			.setColor("DarkRed")
			.setTitle("Audit Event: Message Deleted")
			.setDescription(message.content ? message.content.slice(0, 4096) : "Message had no text content.")
			.addFields(
				{ name: "Author", value: `${userMention(message.author.id)} (${message.author.tag})` },
				{ name: "Channel", value: `${message.channel}` },
			)
			.setTimestamp(),
	);
}

export async function handleAuditVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
	const member = newState.member ?? oldState.member;
	if (!member || oldState.channelId === newState.channelId) {
		return;
	}

	const joined = !oldState.channelId;
	const left = !newState.channelId;
	const title = joined ? "Joined Voice Channel" : left ? "Left Voice Channel" : "Moved Voice Channels";
	const description = joined
		? "A member joined a voice channel."
		: left
			? "A member left a voice channel."
			: "A member moved voice channels.";

	await postAuditEvent(
		newState.guild,
		new EmbedBuilder()
			.setColor(joined ? "Green" : left ? "Red" : "Orange")
			.setTitle(`Audit Event: ${title}`)
			.setDescription(description)
			.addFields(
				{ name: "User", value: `${userMention(member.id)} (${member.user.tag})` },
				...(joined
					? [{ name: "Channel", value: `<#${newState.channelId}>`, inline: true }]
					: left
						? [{ name: "Channel", value: `<#${oldState.channelId}>`, inline: true }]
						: [
								{ name: "From", value: `<#${oldState.channelId}>`, inline: true },
								{ name: "To", value: `<#${newState.channelId}>`, inline: true },
							]),
			)
			.setFooter({ text: `User ID: ${member.id}` })
			.setTimestamp(),
	);
}
