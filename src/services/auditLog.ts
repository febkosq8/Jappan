import type {
	APIEmbed,
	Guild,
	GuildAuditLogsEntry,
	GuildBan,
	GuildChannel,
	GuildMember,
	Invite,
	JSONEncodable,
	Message,
	MessageCreateOptions,
	PartialGuildMember,
	PartialMessage,
	PartialUser,
	ReadonlyCollection,
	Role,
	ThreadChannel,
	User,
	VoiceState,
} from "discord.js";
import {
	AuditLogEvent,
	EmbedBuilder,
	PermissionFlagsBits,
	blockQuote,
	channelMention,
	chatInputApplicationCommandMention,
	italic,
} from "discord.js";

import {
	addAuditEntryDetails,
	addAvatarChange,
	createAuditEventId,
	createContentFollowUps,
	formatAuditValue,
	getAuditEntryActionLabel,
	getAuditEntryChangeDetails,
	getAuditEntryTargetLabel,
	getChannelTypeLabel,
	getComparableEmbed,
	getRecentAuditEntryByTargetId,
	getPermissionOverwriteChangeDetails,
	getProfileChangeResponse,
	getRecentAuditEntry,
	getRoleChangeDetails,
	getRoleCreationDetails,
	getVideoQualityModeLabel,
	isOwnBot,
} from "../helpers/auditLog.js";
import { formatChannelMention, formatRoleMention, formatUserMention } from "../helpers/discord.js";
import { sendGuildMessage } from "../helpers/guildHelper.js";
import { sendResponse } from "../helpers/response.js";
import { splitString, trimString } from "../helpers/string.js";
import type { GuildDocument } from "../models/guild.js";
import { getCommandId } from "./commandLoader.js";
import { getGuildSettings } from "./guild.js";
import { logger } from "./logger.js";

export interface AuditLogStatus {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly auditLog: GuildDocument["auditLog"];
}

export async function setAuditLog({
	guildId,
	guildName,
	enabled,
	channelId,
	fullVerbosity,
}: {
	guildId: string;
	guildName: string;
	enabled: boolean;
	channelId: string | null;
	fullVerbosity: boolean;
}): Promise<AuditLogStatus> {
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

async function postAuditEvent(guild: Guild, content: MessageCreateOptions): Promise<Message | null> {
	const storedGuildData = await getGuildSettings({ guild });
	if (!storedGuildData.auditLog.enabled || !storedGuildData.auditLog.channelId) {
		return null;
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
		return null;
	}

	let firstMessage: Message | null = null;
	try {
		const sentMessages = await sendResponse({
			destination: channel,
			content,
			options: { replyToFirstMessage: true },
		});
		firstMessage = sentMessages[0] ?? null;
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to send audit event", {
			guildId: guild.id,
			channelId,
			error,
		});
		await disableAuditLog(guild, channelId);
		return null;
	}
	return firstMessage;
}

async function isAuditLogEnabled(guild: Guild): Promise<boolean> {
	const status = await getAuditLogStatus(guild.id, guild.name);
	return status.auditLog.enabled && Boolean(status.auditLog.channelId);
}

async function handleAuditBan(ban: GuildBan, action: "Banned" | "Unbanned"): Promise<void> {
	if (isOwnBot(ban.guild, ban.user.id) || !(await isAuditLogEnabled(ban.guild))) {
		return;
	}

	const auditLogType = action === "Banned" ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberBanRemove;
	const auditLogs = await ban.guild.fetchAuditLogs({ limit: 10, type: auditLogType }).catch(() => null);
	const auditEntry = auditLogs?.entries.find(
		(candidateAuditEntry) =>
			candidateAuditEntry.target?.id === ban.user.id &&
			Date.now() - candidateAuditEntry.createdTimestamp < 20_000,
	);
	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor(action === "Banned" ? "DarkRed" : "Green")
		.setTitle(`Audit Event: Member ${action}`)
		.setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL({ size: 256 }) })
		.setDescription(`${formatUserMention(ban.user)} was ${action.toLowerCase()}.`)
		.addFields({
			name: "Action Initiated By",
			value: auditEntry?.executor ? formatUserMention(auditEntry.executor) : "Unknown",
		})
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	if (auditEntry?.reason) {
		embed.addFields({ name: "Reason", value: auditEntry.reason });
	}
	await postAuditEvent(ban.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditChannelCreate(channel: GuildChannel): Promise<void> {
	if (!(await isAuditLogEnabled(channel.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(channel, AuditLogEvent.ChannelCreate);
	const embed = new EmbedBuilder()
		.setColor("DarkGreen")
		.setTitle("Audit Event: Channel Created")
		.setDescription(`${formatChannelMention(channel)} was created.`)
		.addFields(
			{ name: "Channel", value: formatChannelMention(channel) },
			{ name: "Name", value: channel.name },
			{ name: "Type", value: getChannelTypeLabel(channel), inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${createAuditEventId()}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(channel.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditChannelDelete(channel: GuildChannel): Promise<void> {
	if (!(await isAuditLogEnabled(channel.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(channel, AuditLogEvent.ChannelDelete);
	const embed = new EmbedBuilder()
		.setColor("Red")
		.setTitle("Audit Event: Channel Deleted")
		.setDescription(`${formatChannelMention(channel)} was deleted.`)
		.addFields(
			{ name: "Channel", value: formatChannelMention(channel) },
			{ name: "Name", value: channel.name },
			{ name: "Type", value: getChannelTypeLabel(channel), inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${createAuditEventId()}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(channel.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditRoleCreate(role: Role): Promise<void> {
	if (!(await isAuditLogEnabled(role.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(role, AuditLogEvent.RoleCreate);
	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Green")
		.setTitle("Audit Event: Role Created")
		.setDescription(`${formatRoleMention(role)} was created.`)
		.addFields({ name: "Role", value: formatRoleMention(role) }, ...getRoleCreationDetails(role))
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(role.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
	const changes = getRoleChangeDetails(oldRole, newRole);
	if (changes.length === 0 || !(await isAuditLogEnabled(newRole.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(newRole, AuditLogEvent.RoleUpdate);
	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Yellow")
		.setTitle("Audit Event: Role Updated")
		.setDescription(`${formatRoleMention(newRole)} was updated.`)
		.addFields({ name: "Role", value: formatRoleMention(newRole) }, { name: "Changes", value: changes.join("\n") })
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(newRole.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditRoleDelete(role: Role): Promise<void> {
	if (!(await isAuditLogEnabled(role.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(role, AuditLogEvent.RoleDelete);
	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Red")
		.setTitle("Audit Event: Role Deleted")
		.setDescription(`${formatRoleMention(role)} was deleted.`)
		.addFields({ name: "Role", value: formatRoleMention(role) })
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(role.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditChannelUpdate(oldChannel: GuildChannel, newChannel: GuildChannel): Promise<void> {
	const changes: string[] = [];
	if (oldChannel.type !== newChannel.type) {
		changes.push(`Channel Type: \`${getChannelTypeLabel(oldChannel)}\` -> \`${getChannelTypeLabel(newChannel)}\``);
	}
	if (oldChannel.name !== newChannel.name) {
		changes.push(`Name: \`${oldChannel.name}\` -> \`${newChannel.name}\``);
	}
	if ("nsfw" in oldChannel && "nsfw" in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
		changes.push(`NSFW: \`${oldChannel.nsfw ? "ON" : "OFF"}\` -> \`${newChannel.nsfw ? "ON" : "OFF"}\``);
	}
	if ("topic" in oldChannel && "topic" in newChannel && oldChannel.topic !== newChannel.topic) {
		const oldTopic = oldChannel.topic as string | null;
		const newTopic = newChannel.topic as string | null;
		changes.push(`Topic: ${formatAuditValue(oldTopic)} -> ${formatAuditValue(newTopic)}`);
	}
	if (oldChannel.rawPosition !== newChannel.rawPosition) {
		changes.push(`Position: \`${oldChannel.rawPosition}\` -> \`${newChannel.rawPosition}\``);
	}
	if (oldChannel.flags.bitfield !== newChannel.flags.bitfield) {
		changes.push(
			`Channel flags: ${formatAuditValue(oldChannel.flags.toArray().join(", ") || null)} -> ${formatAuditValue(newChannel.flags.toArray().join(", ") || null)}`,
		);
	}
	if ("bitrate" in oldChannel && "bitrate" in newChannel && oldChannel.bitrate !== newChannel.bitrate) {
		changes.push(`Bitrate: \`${oldChannel.bitrate}\` -> \`${newChannel.bitrate}\``);
	}
	if ("userLimit" in oldChannel && "userLimit" in newChannel && oldChannel.userLimit !== newChannel.userLimit) {
		changes.push(`User Limit: \`${oldChannel.userLimit}\` -> \`${newChannel.userLimit}\``);
	}
	if (
		"videoQualityMode" in oldChannel &&
		"videoQualityMode" in newChannel &&
		oldChannel.videoQualityMode !== newChannel.videoQualityMode
	) {
		const oldVideoQualityMode = oldChannel.videoQualityMode as Parameters<typeof getVideoQualityModeLabel>[0];
		const newVideoQualityMode = newChannel.videoQualityMode as Parameters<typeof getVideoQualityModeLabel>[0];
		changes.push(
			`Video Quality Mode: ${formatAuditValue(getVideoQualityModeLabel(oldVideoQualityMode))} -> ${formatAuditValue(getVideoQualityModeLabel(newVideoQualityMode))}`,
		);
	}
	if ("rtcRegion" in oldChannel && "rtcRegion" in newChannel && oldChannel.rtcRegion !== newChannel.rtcRegion) {
		changes.push(
			`RTC Region: \`${oldChannel.rtcRegion ?? "Automatic"}\` -> \`${newChannel.rtcRegion ?? "Automatic"}\``,
		);
	}
	if (
		"rateLimitPerUser" in oldChannel &&
		"rateLimitPerUser" in newChannel &&
		oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser
	) {
		changes.push(`Slowmode: \`${oldChannel.rateLimitPerUser}s\` -> \`${newChannel.rateLimitPerUser}s\``);
	}
	if (
		"defaultAutoArchiveDuration" in oldChannel &&
		"defaultAutoArchiveDuration" in newChannel &&
		oldChannel.defaultAutoArchiveDuration !== newChannel.defaultAutoArchiveDuration
	) {
		const oldAutoArchiveDuration = oldChannel.defaultAutoArchiveDuration as number | null;
		const newAutoArchiveDuration = newChannel.defaultAutoArchiveDuration as number | null;
		changes.push(
			`Default Thread Auto-Archive Duration: ${formatAuditValue(oldAutoArchiveDuration)} minutes -> ${formatAuditValue(newAutoArchiveDuration)} minutes`,
		);
	}
	const oldOverwrites = oldChannel.permissionOverwrites.cache;
	const newOverwrites = newChannel.permissionOverwrites.cache;
	const permissionOverwriteChanges = getPermissionOverwriteChangeDetails({
		guild: newChannel.guild,
		oldOverwrites,
		newOverwrites,
	});
	const overwritesChanged =
		oldOverwrites.size !== newOverwrites.size ||
		[...oldOverwrites.values()].some((oldOverwrite) => {
			const newOverwrite = newOverwrites.get(oldOverwrite.id);
			return (
				!newOverwrite ||
				oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield ||
				oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield
			);
		});
	if (
		(changes.length === 0 && permissionOverwriteChanges.length === 0) ||
		!(await isAuditLogEnabled(newChannel.guild))
	) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(newChannel, AuditLogEvent.ChannelUpdate);
	let overwriteEntry = auditEntry;
	if (!overwriteEntry && overwritesChanged) {
		const overwriteAuditTypes: Array<
			| AuditLogEvent.ChannelOverwriteCreate
			| AuditLogEvent.ChannelOverwriteUpdate
			| AuditLogEvent.ChannelOverwriteDelete
		> = [
			AuditLogEvent.ChannelOverwriteCreate,
			AuditLogEvent.ChannelOverwriteUpdate,
			AuditLogEvent.ChannelOverwriteDelete,
		];
		for (const overwriteAuditType of overwriteAuditTypes) {
			overwriteEntry = await getRecentAuditEntry(newChannel, overwriteAuditType);
			if (overwriteEntry) {
				break;
			}
		}
	}
	const embed = new EmbedBuilder()
		.setColor("Yellow")
		.setTitle("Audit Event: Channel Updated")
		.setDescription(`${formatChannelMention(newChannel)} was updated.`)
		.addFields(
			{ name: "Channel", value: formatChannelMention(newChannel), inline: true },
			{ name: "Type", value: getChannelTypeLabel(newChannel), inline: true },
			{ name: "Changes", value: changes.join("\n") },
			...permissionOverwriteChanges.map((change) => ({ name: "Permission Overwrite", value: change })),
		)
		.setFooter({ text: `Audit Event ID: ${createAuditEventId()}` })
		.setTimestamp();
	addAuditEntryDetails(embed, overwriteEntry);
	await postAuditEvent(newChannel.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditThreadCreate(thread: ThreadChannel): Promise<void> {
	if (!(await isAuditLogEnabled(thread.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(thread, AuditLogEvent.ThreadCreate);
	const embed = new EmbedBuilder()
		.setColor("DarkGreen")
		.setTitle("Audit Event: Thread Created")
		.setDescription(`${formatChannelMention(thread)} was created.`)
		.addFields(
			{ name: "Name", value: thread.name },
			{ name: "Channel", value: formatChannelMention(thread) },
			{ name: "Type", value: getChannelTypeLabel(thread), inline: true },
			{ name: "Parent", value: thread.parent ? formatChannelMention(thread.parent) : "None", inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${createAuditEventId()}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(thread.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditThreadUpdate(oldThread: ThreadChannel, newThread: ThreadChannel): Promise<void> {
	const changes: string[] = [];
	if (oldThread.name !== newThread.name) {
		changes.push(`Name: ${formatAuditValue(oldThread.name)} -> ${formatAuditValue(newThread.name)}`);
	}
	if (oldThread.flags.bitfield !== newThread.flags.bitfield) {
		changes.push(
			`Channel flags: ${formatAuditValue(oldThread.flags.toArray().join(", ") || null)} -> ${formatAuditValue(newThread.flags.toArray().join(", ") || null)}`,
		);
	}
	if (oldThread.archived !== newThread.archived) {
		changes.push(
			`Archived: ${formatAuditValue(oldThread.archived ? "ON" : "OFF")} -> ${formatAuditValue(newThread.archived ? "ON" : "OFF")}`,
		);
	}
	if (oldThread.locked !== newThread.locked) {
		changes.push(
			`Locked: ${formatAuditValue(oldThread.locked ? "ON" : "OFF")} -> ${formatAuditValue(newThread.locked ? "ON" : "OFF")}`,
		);
	}
	if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
		changes.push(
			`Auto-Archive Duration: ${formatAuditValue(oldThread.autoArchiveDuration)} minutes -> ${formatAuditValue(newThread.autoArchiveDuration)} minutes`,
		);
	}
	if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
		changes.push(
			`Slowmode: ${formatAuditValue(oldThread.rateLimitPerUser)}s -> ${formatAuditValue(newThread.rateLimitPerUser)}s`,
		);
	}
	if ("invitable" in oldThread && "invitable" in newThread && oldThread.invitable !== newThread.invitable) {
		changes.push(
			`Invitable: ${formatAuditValue(oldThread.invitable ? "ON" : "OFF")} -> ${formatAuditValue(newThread.invitable ? "ON" : "OFF")}`,
		);
	}
	if (changes.length === 0 || !(await isAuditLogEnabled(newThread.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(newThread, AuditLogEvent.ThreadUpdate);
	const embed = new EmbedBuilder()
		.setColor("Yellow")
		.setTitle("Audit Event: Thread Updated")
		.setDescription(`${formatChannelMention(newThread)} was updated.`)
		.addFields(
			{ name: "Channel", value: formatChannelMention(newThread), inline: true },
			{ name: "Type", value: getChannelTypeLabel(newThread), inline: true },
			{ name: "Changes", value: changes.join("\n") },
		)
		.setFooter({ text: `Audit Event ID: ${createAuditEventId()}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(newThread.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditThreadDelete(thread: ThreadChannel): Promise<void> {
	if (!(await isAuditLogEnabled(thread.guild))) {
		return;
	}

	const auditEntry = await getRecentAuditEntry(thread, AuditLogEvent.ThreadDelete);
	const embed = new EmbedBuilder()
		.setColor("Red")
		.setTitle("Audit Event: Thread Deleted")
		.setDescription(`${formatChannelMention(thread)} was deleted.`)
		.addFields(
			{ name: "Name", value: thread.name },
			{ name: "Channel", value: formatChannelMention(thread) },
			{ name: "Type", value: getChannelTypeLabel(thread), inline: true },
			{ name: "Parent", value: thread.parent ? formatChannelMention(thread.parent) : "None", inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${createAuditEventId()}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(thread.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditMemberBanAdd(ban: GuildBan): Promise<void> {
	await handleAuditBan(ban, "Banned");
}

export async function handleAuditMemberBanRemove(ban: GuildBan): Promise<void> {
	await handleAuditBan(ban, "Unbanned");
}

export async function handleAuditLogEntryCreate(auditEntry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
	if (!(await isAuditLogEnabled(guild))) {
		return;
	}

	const changes = getAuditEntryChangeDetails(auditEntry);
	const embed = new EmbedBuilder()
		.setColor("DarkGreen")
		.setTitle(`Audit Event: New Audit Log Entry`)
		.addFields(
			{ name: "Action", value: getAuditEntryActionLabel(auditEntry.action), inline: true },
			{ name: "Target Type", value: auditEntry.targetType ?? "Unknown", inline: true },
			{ name: "Target", value: getAuditEntryTargetLabel(auditEntry) },
		)
		.setFooter({ text: `Audit Log ID: ${auditEntry.id}` })
		.setTimestamp();
	if (changes.length > 0) {
		embed.addFields(changes.map((change) => ({ name: "Changed", value: change })));
	}
	addAuditEntryDetails(embed, auditEntry);
	await postAuditEvent(guild, { embeds: [embed], allowedMentions: { parse: [] } });
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
	const commandId = getCommandId("auditlog");
	const commandMention = commandId
		? chatInputApplicationCommandMention("auditlog", "on", commandId)
		: "the command menu";
	const notified = await sendGuildMessage({
		guild,
		content: `⚠️ Audit logging was automatically disabled because I can no longer access ${channelMention(channelId)}.\n📢 PSA for admins: please configure a new channel with ${commandMention}.`,
		failureMessage: "Failed to notify guild about disabled audit logging",
		details: { channelId },
	});
	if (!notified) {
		logger.warn("DISCORD", "Could not notify guild that audit logging was disabled", {
			guildId: guild.id,
			channelId,
		});
	}
}

export async function handleAuditMemberAdd(member: GuildMember): Promise<void> {
	if (isOwnBot(member.guild, member.user.id)) {
		return;
	}
	if (!(await isAuditLogEnabled(member.guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Green")
		.setTitle("Audit Event: Member Joined")
		.setDescription(`${formatUserMention(member)} joined the server.`)
		.addFields({ name: "User", value: formatUserMention(member) })
		.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(member.guild, { embeds: [embed] });
}

export async function handleAuditMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
	if (isOwnBot(member.guild, member.user.id)) {
		return;
	}
	if (!(await isAuditLogEnabled(member.guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Red")
		.setTitle("Audit Event: Member Left")
		.setDescription(`${formatUserMention(member)} left the server.`)
		.addFields({ name: "User", value: formatUserMention(member) })
		.setThumbnail(member.user.displayAvatarURL({ size: 256 }))
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(member.guild, { embeds: [embed] });
}

export async function handleAuditMemberUpdate(
	oldMember: GuildMember | PartialGuildMember,
	newMember: GuildMember,
): Promise<void> {
	if (isOwnBot(newMember.guild, newMember.user.id)) {
		return;
	}

	const profileChange = getProfileChangeResponse(oldMember, newMember);
	if (
		!profileChange.nicknameChanged &&
		!profileChange.rolesChanged &&
		!profileChange.timeoutChanged &&
		!profileChange.avatarChanged
	) {
		return;
	}
	if (!(await isAuditLogEnabled(newMember.guild))) {
		return;
	}
	const auditEntry = await getRecentAuditEntry(
		newMember,
		profileChange.rolesChanged
			? [AuditLogEvent.MemberRoleUpdate, AuditLogEvent.MemberUpdate]
			: AuditLogEvent.MemberUpdate,
	);

	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: "User", value: formatUserMention(newMember), inline: true },
	];
	if (profileChange.nicknameChanged) {
		if (oldMember.nickname) {
			fields.push({ name: "Old Nickname", value: oldMember.nickname, inline: true });
		}
		if (newMember.nickname) {
			fields.push({ name: "New Nickname", value: newMember.nickname, inline: true });
		}
	}
	if (profileChange.rolesChanged) {
		if (profileChange.addedRoles.length > 0) {
			fields.push({
				name: "Added Roles",
				value: profileChange.addedRoles.map((role) => formatRoleMention(role)).join(", "),
			});
		}
		if (profileChange.removedRoles.length > 0) {
			fields.push({
				name: "Removed Roles",
				value: profileChange.removedRoles.map((role) => formatRoleMention(role)).join(","),
			});
		}
	}
	if (profileChange.timeoutChanged) {
		if (profileChange.timeoutChangeLabel === "Updated") {
			fields.push(
				{
					name: "Previous Timeout Until",
					value: oldMember.communicationDisabledUntilTimestamp
						? `<t:${Math.floor(oldMember.communicationDisabledUntilTimestamp / 1000)}:F>`
						: "No timeout",
				},
				{
					name: "Timeout Updated Until",
					value: newMember.communicationDisabledUntilTimestamp
						? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
						: "No timeout",
				},
			);
		} else {
			fields.push({
				name: profileChange.timeoutChangeLabel === "Added" ? "Timed Out Until" : "Timeout Removed",
				value: newMember.communicationDisabledUntilTimestamp
					? `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
					: oldMember.communicationDisabledUntilTimestamp
						? `<t:${Math.floor(oldMember.communicationDisabledUntilTimestamp / 1000)}:F>`
						: "No timeout",
			});
		}
	}
	if (profileChange.avatarChanged) {
		fields.push({
			name: "Server Avatar Change",
			value: profileChange.avatarChangeLabel,
			inline: true,
		});
	}
	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("Yellow")
		.setTitle(`Audit Event: ${profileChange.title}`)
		.setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ size: 256 }) })
		.setDescription(profileChange.description)
		.addFields(fields)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	if (profileChange.avatarChanged) {
		addAvatarChange({
			embed,
			oldAvatarUrl: oldMember.displayAvatarURL({ size: 256 }),
			newAvatarUrl: newMember.displayAvatarURL({ size: 256 }),
			avatarLabel: "Server Avatar",
		});
	}
	await postAuditEvent(newMember.guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditInviteCreate(invite: Invite): Promise<void> {
	const guild = invite.guild ? invite.client.guilds.cache.get(invite.guild.id) : undefined;
	if (!guild || !invite.inviterId || isOwnBot(guild, invite.inviterId)) {
		return;
	}
	if (!(await isAuditLogEnabled(guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const inviter = invite.inviter;
	const channel =
		invite.channel && !invite.channel.isDMBased() ? formatChannelMention(invite.channel) : "Unknown channel";
	const createdAt = invite.createdTimestamp ? `<t:${Math.floor(invite.createdTimestamp / 1000)}:F>` : "Unknown";
	const expiresAt = invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : "Never";
	const embed = new EmbedBuilder()
		.setColor("Aqua")
		.setTitle("Audit Event: Invite Created")
		.setDescription(
			invite.inviter ? `${formatUserMention(invite.inviter)} created an invite.` : "An invite was created.",
		)
		.addFields(
			{ name: "Invite Code", value: `\`${invite.code}\``, inline: true },
			{ name: "Channel", value: channel, inline: true },
			{ name: "Created At", value: createdAt },
			{ name: "Expires", value: expiresAt, inline: true },
			{ name: "Maximum Uses", value: invite.maxUses ? `${invite.maxUses}` : "Unlimited", inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	if (inviter) {
		embed.setAuthor({ name: inviter.tag, iconURL: inviter.displayAvatarURL({ size: 256 }) });
	}
	await postAuditEvent(guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditInviteDelete(invite: Invite): Promise<void> {
	const guild = invite.guild ? invite.client.guilds.cache.get(invite.guild.id) : undefined;
	if (!guild) {
		return;
	}
	if (!(await isAuditLogEnabled(guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const channel =
		invite.channel && !invite.channel.isDMBased() ? formatChannelMention(invite.channel) : "Unknown channel";
	const embed = new EmbedBuilder()
		.setColor("LuminousVividPink")
		.setTitle("Audit Event: Invite Revoked")
		.setDescription("An invite was revoked.")
		.addFields(
			{ name: "Invite Code", value: `\`${invite.code}\``, inline: true },
			{ name: "Channel", value: channel, inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(guild, { embeds: [embed], allowedMentions: { parse: [] } });
}

export async function handleAuditUserUpdate(oldUser: PartialUser | User, newUser: User): Promise<void> {
	const profileChange = getProfileChangeResponse(oldUser, newUser);
	if (!profileChange.usernameChanged && !profileChange.globalNameChanged && !profileChange.avatarChanged) {
		return;
	}

	await Promise.all(
		newUser.client.guilds.cache.map(async (guild) => {
			if (isOwnBot(guild, newUser.id)) {
				return;
			}
			const member = await guild.members.fetch(newUser.id).catch(() => null);
			if (!member || !(await isAuditLogEnabled(guild))) {
				return;
			}

			const auditEventId = createAuditEventId();
			const embed = new EmbedBuilder()
				.setColor("Yellow")
				.setTitle(`Audit Event: ${profileChange.title}`)
				.setAuthor({ name: newUser.tag, iconURL: newUser.displayAvatarURL({ size: 256 }) })
				.setDescription(profileChange.description)
				.addFields({ name: "User", value: formatUserMention(newUser), inline: true })
				.setFooter({ text: `Audit Event ID: ${auditEventId}` })
				.setTimestamp();
			if (profileChange.usernameChanged) {
				embed.addFields(
					{ name: "Old Username", value: oldUser.username ?? "Unknown", inline: true },
					{ name: "New Username", value: newUser.username, inline: true },
				);
			}
			if (profileChange.globalNameChanged) {
				if (oldUser.globalName) {
					embed.addFields({ name: "Old Display Name", value: oldUser.globalName, inline: true });
				}
				if (newUser.globalName) {
					embed.addFields({ name: "New Display Name", value: newUser.globalName, inline: true });
				}
			}
			if (profileChange.avatarChanged) {
				addAvatarChange({
					embed,
					oldAvatarUrl: oldUser.displayAvatarURL({ size: 256 }),
					newAvatarUrl: newUser.displayAvatarURL({ size: 256 }),
					avatarLabel: "Avatar",
				});
			}
			await postAuditEvent(guild, { embeds: [embed], allowedMentions: { parse: [] } });
		}),
	);
}

export async function handleAuditMessageUpdate(
	oldMessage: Message | PartialMessage,
	newMessage: Message | PartialMessage,
): Promise<void> {
	const guild = newMessage.guild ?? oldMessage.guild;
	const author = newMessage.author ?? oldMessage.author;
	if (!guild || !author || isOwnBot(guild, author.id)) {
		return;
	}
	if (!(await isAuditLogEnabled(guild))) {
		return;
	}
	const oldMessageWasNotCached = oldMessage.partial;
	const oldEmbeds = JSON.stringify(oldMessage.embeds.map((embed) => getComparableEmbed(embed)));
	const newEmbeds = JSON.stringify(newMessage.embeds.map((embed) => getComparableEmbed(embed)));
	const contentChanged = oldMessageWasNotCached || oldMessage.content !== newMessage.content;
	const embedsChanged = oldMessageWasNotCached || oldEmbeds !== newEmbeds;
	if (!contentChanged && !embedsChanged) {
		return;
	}
	const auditEventId = createAuditEventId();
	const hasPreviousEmbedFollowUp = embedsChanged && oldMessage.embeds.length > 0;
	const hasUpdatedEmbedFollowUp = embedsChanged && newMessage.embeds.length > 0;
	const previousContent = oldMessage.content ?? "";
	const updatedContent = newMessage.content ?? "";
	const previousContentWasTrimmed = !oldMessageWasNotCached && previousContent.length > 1020;
	const updatedContentWasTrimmed = updatedContent.length > 1020;
	const updatedEmbeds = newMessage.embeds.map((originalEmbed) => originalEmbed.toJSON());
	const previousContentPageCount = previousContentWasTrimmed ? splitString(previousContent, 4000).length : 0;
	const updatedContentPageCount = updatedContentWasTrimmed ? splitString(updatedContent, 4000).length : 0;
	const contentFollowUpPageCount = previousContentPageCount + updatedContentPageCount;
	const followUpPageCount =
		contentFollowUpPageCount +
		(hasPreviousEmbedFollowUp ? oldMessage.embeds.length : 0) +
		(hasUpdatedEmbedFollowUp ? updatedEmbeds.length : 0);
	const totalPageCount = 1 + followUpPageCount;
	const contentFollowUps = [
		...(previousContentWasTrimmed
			? createContentFollowUps({
					title: "Full Previous Content",
					content: previousContent,
					auditEventId,
					color: "Orange",
					messageId: newMessage.id,
					pageOffset: 1,
					totalPages: totalPageCount,
				})
			: []),
		...(updatedContentWasTrimmed
			? createContentFollowUps({
					title: "Full Updated Content",
					content: updatedContent,
					auditEventId,
					color: "Orange",
					messageId: newMessage.id,
					pageOffset: 1 + previousContentPageCount,
					totalPages: totalPageCount,
				})
			: []),
	];
	const previousEmbedFollowUps = hasPreviousEmbedFollowUp
		? oldMessage.embeds.map((originalEmbed, pageIndex) =>
				EmbedBuilder.from(originalEmbed.toJSON()).setTitle(
					`${originalEmbed.data.title ?? "Previous Embed"} (MID: ${newMessage.id}) (Page ${contentFollowUpPageCount + pageIndex + 2}/${totalPageCount})`,
				),
			)
		: [];
	const updatedEmbedFollowUps = hasUpdatedEmbedFollowUp
		? updatedEmbeds.map((originalEmbed, pageIndex) =>
				EmbedBuilder.from(originalEmbed).setTitle(
					`${originalEmbed.title ?? "Updated Embed"} (MID: ${newMessage.id}) (Page ${contentFollowUpPageCount + (hasPreviousEmbedFollowUp ? oldMessage.embeds.length : 0) + pageIndex + 2}/${totalPageCount})`,
				),
			)
		: [];
	const messageChannelType = newMessage.channel.isDMBased()
		? "Direct Message"
		: getChannelTypeLabel(newMessage.channel);
	const embed = new EmbedBuilder()
		.setColor("Orange")
		.setTitle(
			followUpPageCount > 0
				? `Audit Event: Message Edited (Page 1/${totalPageCount})`
				: "Audit Event: Message Edited",
		)
		.setDescription(
			oldMessageWasNotCached
				? "A message was edited, but the previous version was not cached. The updated content is shown below."
				: hasPreviousEmbedFollowUp || hasUpdatedEmbedFollowUp
					? "A message was edited. The updated embeds are included with this audit event."
					: embedsChanged
						? "A message was edited and its embed content changed."
						: "A message was edited.",
		)
		.addFields(
			{
				name: "Previous Content",
				value: oldMessageWasNotCached
					? italic("Previous content unavailable because the message was not cached.")
					: blockQuote(trimString(oldMessage.content || "No text content.", 1020)),
			},
			{
				name: "Updated Content",
				value: blockQuote(trimString(newMessage.content || "No text content.", 1020)),
			},
			{ name: "Author", value: formatUserMention(author), inline: true },
			{
				name: "Channel",
				value: newMessage.channel.isDMBased()
					? channelMention(newMessage.channel.id)
					: formatChannelMention(newMessage.channel),
				inline: true,
			},
			{ name: "Type", value: messageChannelType, inline: true },
			{ name: "Created At", value: `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:F>` },
			{
				name: "Updated At",
				value: newMessage.editedTimestamp
					? `<t:${Math.floor(newMessage.editedTimestamp / 1000)}:F>`
					: "Unknown",
			},
			{ name: "Message ID", value: newMessage.id },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(guild, {
		embeds: [embed, ...contentFollowUps, ...previousEmbedFollowUps, ...updatedEmbedFollowUps],
		allowedMentions: { parse: [] },
	});
}

export async function handleAuditMessageDelete(message: Message | PartialMessage): Promise<void> {
	if (!message.guild || isOwnBot(message.guild, message.author?.id ?? "")) {
		return;
	}
	const auditStatus = await getAuditLogStatus(message.guild.id, message.guild.name);
	if (!auditStatus.auditLog.enabled || !auditStatus.auditLog.channelId) {
		return;
	}
	if (message.partial && !auditStatus.auditLog.fullVerbosity) {
		return;
	}
	const auditEntry = await getRecentAuditEntryByTargetId({
		guild: message.guild,
		targetId: message.id,
		types: AuditLogEvent.MessageDelete,
	});

	const author = message.author;
	const content = message.content ?? "";
	const hasOriginalEmbeds = message.embeds.length > 0;
	const hasAttachments = message.attachments.size > 0;
	const hasLongContent = content.length > 1024;
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
				value: content ? trimString(content, 1024) : "Content unavailable because the message was not cached.",
			},
			{
				name: "Author",
				value: author ? formatUserMention(author) : "Author unavailable because the message was not cached.",
			},
			{
				name: "Channel",
				value: message.channel.isDMBased()
					? channelMention(message.channel.id)
					: formatChannelMention(message.channel),
			},
			{ name: "Created At", value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>` },
			{ name: "Message ID", value: message.id },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);
	const auditEmbeds: Array<APIEmbed | JSONEncodable<APIEmbed>> = [embed];
	if (hasFollowUp) {
		const contentPages = splitString(content, 1700);
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
						`**Original message (MID: ${message.id}) from ${author ? formatUserMention(author) : "Unknown author"}:**`,
						contentPage ? blockQuote(contentPage) : "",
						pageIndex === 0 && attachmentLinks ? `Attachments:\n${attachmentLinks}` : "",
					]
						.filter(Boolean)
						.join("\n"),
				)
				.setFooter({ text: `Audit Event ID: ${auditEventId}` })
				.setTimestamp();
			auditEmbeds.push(
				pageEmbed,
				...(pageIndex === 0 ? message.embeds.map((originalEmbed) => originalEmbed.toJSON()) : []),
			);
		}
	}
	await postAuditEvent(message.guild, { embeds: auditEmbeds, allowedMentions: { parse: [] } });
}

export async function handleAuditMessageBulkDelete(
	messages: ReadonlyCollection<string, Message | PartialMessage>,
): Promise<void> {
	const firstMessage = messages.find((message) => Boolean(message.guild));
	const guild = firstMessage?.guild;
	if (!guild) {
		return;
	}
	const originalMessages = [...messages.values()].filter((message) => !isOwnBot(guild, message.author?.id ?? ""));
	if (originalMessages.length === 0) {
		return;
	}
	if (!(await isAuditLogEnabled(guild))) {
		return;
	}
	const auditEntry = await getRecentAuditEntryByTargetId({
		guild,
		targetId: firstMessage.channel.id,
		types: AuditLogEvent.MessageBulkDelete,
	});

	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("DarkRed")
		.setTitle("Audit Event: Bulk Messages Deleted")
		.setDescription(
			"Multiple messages were deleted at once. The original messages are included in the follow-up below.",
		)
		.addFields(
			{ name: "Messages Deleted", value: `${originalMessages.length}`, inline: true },
			{
				name: "Channel",
				value: firstMessage.channel.isDMBased()
					? channelMention(firstMessage.channel.id)
					: formatChannelMention(firstMessage.channel),
				inline: true,
			},
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	addAuditEntryDetails(embed, auditEntry);

	const auditEmbeds: Array<APIEmbed | JSONEncodable<APIEmbed>> = [embed];

	const pagePrefix = `Follow-up for Audit Event ID: ${auditEventId}\n\n`;
	const maxPageContentLength = 4096 - pagePrefix.length;
	const messageBlocks = originalMessages.flatMap((message, index) => {
		const author = message.author ? formatUserMention(message.author) : "Unknown author";
		const messageHeader = `**Message ${index + 1} (ID: ${message.id}) from ${author}:**`;
		const continuedMessageHeader = `**Message ${index + 1} (ID: ${message.id}) from ${author} (continued):**`;
		const attachments = [...message.attachments.values()]
			.map((attachment) => `[Attachment: ${attachment.name}](${attachment.url})`)
			.join(", ");
		const quotedContent = (message.content ?? "No text content.")
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
		const messageContent = [quotedContent, attachments ? `Attachments: ${attachments}` : ""]
			.filter(Boolean)
			.join("\n");
		const completeMessage = `${messageHeader}\n${messageContent}`;
		if (completeMessage.length <= maxPageContentLength) {
			return [completeMessage];
		}

		const firstContentLength = Math.min(75, messageContent.length);
		const firstSegment = `${messageHeader}\n${messageContent.slice(0, firstContentLength)}`;
		const continuationContentLength = Math.max(1, maxPageContentLength - continuedMessageHeader.length - 1);
		const remainingContent = messageContent.slice(firstContentLength);
		return [
			firstSegment,
			...splitString(remainingContent, continuationContentLength).map(
				(contentSegment) => `${continuedMessageHeader}\n${contentSegment}`,
			),
		];
	});
	const contentPages: string[] = [];
	let currentPage = "";
	for (const messageBlock of messageBlocks) {
		const nextPage = currentPage ? `${currentPage}\n\n${messageBlock}` : messageBlock;
		if (nextPage.length <= maxPageContentLength) {
			currentPage = nextPage;
			continue;
		}

		if (currentPage) {
			contentPages.push(currentPage);
		}
		if (messageBlock.length <= maxPageContentLength) {
			currentPage = messageBlock;
			continue;
		}
		contentPages.push(...splitString(messageBlock, maxPageContentLength));
		currentPage = "";
	}
	if (currentPage) {
		contentPages.push(currentPage);
	}

	for (const [pageIndex, contentPage] of contentPages.entries()) {
		const pageEmbed = new EmbedBuilder()
			.setColor("DarkRed")
			.setTitle(`Messages Bulk Deleted (Page ${pageIndex + 1}/${contentPages.length})`)
			.setDescription(`${pagePrefix}${contentPage}`)
			.setFooter({ text: `Audit Event ID: ${auditEventId}` })
			.setTimestamp();
		auditEmbeds.push(pageEmbed);
	}
	await postAuditEvent(guild, { embeds: auditEmbeds, allowedMentions: { parse: [] } });
}

export async function handleAuditVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
	const member = newState.member ?? oldState.member;
	if (!member || isOwnBot(newState.guild, member.user.id)) {
		return;
	}

	const hasChannelChange = oldState.channelId !== newState.channelId;
	const changes: { name: string; value: string; inline: true }[] = [];
	const oldServerMute = Boolean(oldState.serverMute);
	const newServerMute = Boolean(newState.serverMute);
	const oldServerDeaf = Boolean(oldState.serverDeaf);
	const newServerDeaf = Boolean(newState.serverDeaf);
	const oldSelfMute = Boolean(oldState.selfMute);
	const newSelfMute = Boolean(newState.selfMute);
	const oldSelfDeaf = Boolean(oldState.selfDeaf);
	const newSelfDeaf = Boolean(newState.selfDeaf);
	const oldSelfVideo = Boolean(oldState.selfVideo);
	const newSelfVideo = Boolean(newState.selfVideo);
	const oldStreaming = Boolean(oldState.streaming);
	const newStreaming = Boolean(newState.streaming);
	if (oldServerMute !== newServerMute) {
		changes.push({
			name: "☁️🎙️ Server mute",
			value: `${oldServerMute ? "ON" : "OFF"} -> ${newServerMute ? "ON" : "OFF"}`,
			inline: true,
		});
	}
	if (oldServerDeaf !== newServerDeaf) {
		changes.push({
			name: "☁️🎧 Server deafen",
			value: `${oldServerDeaf ? "ON" : "OFF"} -> ${newServerDeaf ? "ON" : "OFF"}`,
			inline: true,
		});
	}
	if (oldSelfMute !== newSelfMute) {
		changes.push({
			name: "🎙️ Self mute",
			value: `${oldSelfMute ? "ON" : "OFF"} -> ${newSelfMute ? "ON" : "OFF"}`,
			inline: true,
		});
	}
	if (oldSelfDeaf !== newSelfDeaf) {
		changes.push({
			name: "🎧 Self deafen",
			value: `${oldSelfDeaf ? "ON" : "OFF"} -> ${newSelfDeaf ? "ON" : "OFF"}`,
			inline: true,
		});
	}
	if (oldSelfVideo !== newSelfVideo) {
		changes.push({
			name: "📹 Video",
			value: `${oldSelfVideo ? "ON" : "OFF"} -> ${newSelfVideo ? "ON" : "OFF"}`,
			inline: true,
		});
	}
	if (oldStreaming !== newStreaming) {
		changes.push({
			name: "📺 Streaming",
			value: `${oldStreaming ? "ON" : "OFF"} -> ${newStreaming ? "ON" : "OFF"}`,
			inline: true,
		});
	}
	if (!hasChannelChange && changes.length === 0) {
		return;
	}
	if (!(await isAuditLogEnabled(newState.guild))) {
		return;
	}

	const auditEventId = createAuditEventId();
	const joined = !oldState.channelId;
	const left = !newState.channelId;
	const oldChannelMention = oldState.channel ? formatChannelMention(oldState.channel) : "No channel";
	const newChannelMention = newState.channel ? formatChannelMention(newState.channel) : "No channel";
	const title = joined
		? "Joined Voice Channel"
		: left
			? "Left Voice Channel"
			: hasChannelChange
				? "Moved Voice Channels"
				: "Voice State Changed";
	const description = joined
		? "A member joined a voice channel."
		: left
			? "A member left a voice channel."
			: hasChannelChange
				? "A member moved voice channels."
				: "A member changed voice state settings.";
	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: "User", value: formatUserMention(member), inline: !hasChannelChange },
	];
	if (hasChannelChange) {
		if (joined) {
			fields.push({ name: "Channel", value: newChannelMention, inline: true });
		} else if (left) {
			fields.push({ name: "Channel", value: oldChannelMention, inline: true });
		} else {
			fields.push(
				{ name: "From", value: oldChannelMention, inline: true },
				{ name: "To", value: newChannelMention, inline: true },
			);
		}
	} else if (changes.length > 0) {
		fields.push({ name: "Channel", value: newChannelMention, inline: true });
	}
	if (changes.length > 0) {
		fields.push({ name: "Changes", value: "\u200b" });
		fields.push(...changes);
	}

	const embed = new EmbedBuilder()
		.setColor(joined ? "Green" : left ? "Red" : hasChannelChange ? "Orange" : "Yellow")
		.setTitle(`Audit Event: ${title}`)
		.setDescription(description)
		.addFields(fields)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(newState.guild, { embeds: [embed] });
}
