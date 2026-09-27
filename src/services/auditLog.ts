import { randomUUID } from "node:crypto";
import { EmbedBuilder, PermissionFlagsBits, userMention } from "discord.js";
import type {
	Guild,
	GuildMember,
	Message,
	MessageCreateOptions,
	PartialGuildMember,
	PartialMessage,
	VoiceState,
} from "discord.js";

import { sendGuildMessage } from "../helpers/guildHelper.js";
import { splitString, trimString } from "../helpers/string.js";
import type { GuildDocument } from "../models/guild.js";
import { getGuildSettings } from "./guild.js";
import { logger } from "./logger.js";

export interface AuditLogStatus {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly auditLog: GuildDocument["auditLog"];
}

function createAuditEventId(): string {
	return randomUUID();
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

async function postAuditEvent(guild: Guild, content: MessageCreateOptions): Promise<void> {
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

	await channel.send(content);
}

async function isAuditLogEnabled(guild: Guild): Promise<boolean> {
	const status = await getAuditLogStatus(guild.id, guild.name);
	return status.auditLog.enabled && Boolean(status.auditLog.channelId);
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
	if (!(await isAuditLogEnabled(member.guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Green")
		.setTitle("Audit Event: Member Joined")
		.setDescription(`${userMention(member.id)} joined the server.`)
		.addFields({ name: "User", value: `${userMention(member.id)} (${member.user.tag})` })
		.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(member.guild, { embeds: [embed] });
}

export async function handleAuditMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
	if (!(await isAuditLogEnabled(member.guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Red")
		.setTitle("Audit Event: Member Left")
		.setDescription(`${userMention(member.id)} left the server.`)
		.addFields({ name: "User", value: `${userMention(member.id)} (${member.user.tag})` })
		.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(member.guild, { embeds: [embed] });
}

export async function handleAuditMessageDelete(message: Message | PartialMessage): Promise<void> {
	if (!message.guild || message.partial) {
		return;
	}
	if (!(await isAuditLogEnabled(message.guild))) {
		return;
	}

	const hasOriginalEmbeds = message.embeds.length > 0;
	const hasAttachments = message.attachments.size > 0;
	const hasLongContent = message.content.length > 1024;
	const hasFollowUp = hasOriginalEmbeds || hasAttachments || hasLongContent;
	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("DarkRed")
		.setTitle("Audit Event: Message Deleted")
		.setDescription(
			hasFollowUp
				? "A message was deleted. The original message is included in the follow-up below."
				: "A message was deleted.",
		)
		.addFields(
			{
				name: "Content",
				value: trimString(message.content, 1024),
			},
			{ name: "Author", value: `${userMention(message.author.id)} (${message.author.tag})` },
			{ name: "Channel", value: `${message.channel}` },
			{ name: "Created At", value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>` },
			{ name: "Message ID", value: message.id },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(message.guild, { embeds: [embed] });

	if (!hasFollowUp) {
		return;
	}

	const contentPages = splitString(message.content, 1700);
	const attachmentLinks = [...message.attachments.values()]
		.map((attachment, index) => `[Attachment #${index + 1} : ${attachment.name}](${attachment.url})`)
		.join("\n");

	const pageCount = contentPages.length;
	for (const [pageIndex, contentPage] of contentPages.entries()) {
		const pageEmbed = new EmbedBuilder()
			.setColor("DarkRed")
			.setTitle(`Deleted Message Follow-up (Page ${pageIndex + 1}/${pageCount})`)
			.setDescription(
				[
					`**Original message (MID: ${message.id}) from ${userMention(message.author.id)} (${message.author.tag}):**`,
					contentPage ? contentPage.replace(/^/gm, "> ") : "",
					pageIndex === 0 && attachmentLinks ? `Attachments:\n${attachmentLinks}` : "",
				]
					.filter(Boolean)
					.join("\n"),
			)
			.setFooter({ text: `Audit Event ID: ${auditEventId}` })
			.setTimestamp();

		await postAuditEvent(message.guild, {
			embeds: [pageEmbed, ...(pageIndex === 0 ? message.embeds.map((originalEmbed) => originalEmbed.toJSON()) : [])],
			allowedMentions: { parse: [] },
		});
	}
}

export async function handleAuditVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
	const member = newState.member ?? oldState.member;
	if (!member || oldState.channelId === newState.channelId) {
		return;
	}
	if (!(await isAuditLogEnabled(newState.guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const joined = !oldState.channelId;
	const left = !newState.channelId;
	const title = joined ? "Joined Voice Channel" : left ? "Left Voice Channel" : "Moved Voice Channels";
	const description = joined
		? "A member joined a voice channel."
		: left
			? "A member left a voice channel."
			: "A member moved voice channels.";

	const embed = new EmbedBuilder()
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
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(newState.guild, { embeds: [embed] });
}
