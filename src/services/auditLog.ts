import { randomUUID } from "node:crypto";
import {
	AuditLogEvent,
	EmbedBuilder,
	PermissionFlagsBits,
	blockQuote,
	channelMention,
	chatInputApplicationCommandMention,
	italic,
	roleMention,
} from "discord.js";
import type {
	APIEmbed,
	Guild,
	GuildMember,
	Invite,
	JSONEncodable,
	Message,
	MessageCreateOptions,
	PartialGuildMember,
	PartialMessage,
	PartialUser,
	User,
	VoiceState,
} from "discord.js";
import type { ReadonlyCollection } from "discord.js";

import { formatUserMention } from "../helpers/discord.js";
import { sendGuildMessage } from "../helpers/guildHelper.js";
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

const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_EMBED_CHARACTERS_PER_MESSAGE = 6000;

function getEmbedCharacterCount(embed: APIEmbed | JSONEncodable<APIEmbed>): number {
	const serializedEmbed = "toJSON" in embed ? embed.toJSON() : embed;
	return [
		serializedEmbed.author?.name,
		serializedEmbed.title,
		serializedEmbed.description,
		serializedEmbed.footer?.text,
		...(serializedEmbed.fields ?? []).flatMap((field) => [field.name, field.value]),
	].reduce((total, value) => total + (value?.length ?? 0), 0);
}

function createAuditEventId(): string {
	return randomUUID();
}

function createContentFollowUps(
	title: string,
	content: string,
	auditEventId: string,
	color: Parameters<EmbedBuilder["setColor"]>[0],
	messageId: string,
	pageOffset: number,
	totalPages: number,
): EmbedBuilder[] {
	const contentPages = splitString(content, 4000);
	return contentPages.map((contentPage, pageIndex) =>
		new EmbedBuilder()
			.setColor(color)
			.setTitle(`${title} (MID: ${messageId}) (Page ${pageOffset + pageIndex + 1}/${totalPages})`)
			.setDescription(blockQuote(contentPage))
			.setFooter({ text: `Audit Event ID: ${auditEventId}` })
			.setTimestamp(),
	);
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

	const embeds: Array<APIEmbed | JSONEncodable<APIEmbed>> = content.embeds ? [...content.embeds] : [];
	let firstMessage: Message | null = null;
	for (let start = 0; start < Math.max(embeds.length, 1); ) {
		let end = start;
		let pageCharacterCount = 0;
		while (end < embeds.length && end - start < MAX_EMBEDS_PER_MESSAGE) {
			const embed = embeds[end];
			if (!embed) {
				break;
			}
			const embedCharacterCount = getEmbedCharacterCount(embed);
			if (end > start && pageCharacterCount + embedCharacterCount > MAX_EMBED_CHARACTERS_PER_MESSAGE) {
				break;
			}
			pageCharacterCount += embedCharacterCount;
			end += 1;
		}
		if (end === start) {
			end += 1;
		}
		const pageContent: MessageCreateOptions = {
			...content,
			embeds: embeds.slice(start, end),
		};
		if (firstMessage) {
			pageContent.reply = { messageReference: firstMessage.id };
		}
		const sentMessage = await channel.send(pageContent);
		firstMessage ??= sentMessage;
		start = end;
	}
	return firstMessage;
}

async function isAuditLogEnabled(guild: Guild): Promise<boolean> {
	const status = await getAuditLogStatus(guild.id, guild.name);
	return status.auditLog.enabled && Boolean(status.auditLog.channelId);
}

function isOwnBot(guild: Guild, userId: string): boolean {
	return guild.client.user?.id === userId;
}

type AuditProfile = User | PartialUser | GuildMember | PartialGuildMember;

interface ProfileChangeResponse {
	readonly usernameChanged: boolean;
	readonly globalNameChanged: boolean;
	readonly nicknameChanged: boolean;
	readonly rolesChanged: boolean;
	readonly timeoutChanged: boolean;
	readonly timeoutChangeLabel: "Added" | "Removed" | "Updated";
	readonly avatarChanged: boolean;
	readonly avatarChangeLabel: "Added" | "Removed" | "Updated";
	readonly addedRoleIds: readonly string[];
	readonly removedRoleIds: readonly string[];
	readonly title: string;
	readonly description: string;
}

function getChangeLabel(
	oldValue: string | number | null | undefined,
	newValue: string | number | null | undefined,
): "Added" | "Removed" | "Updated" {
	return oldValue == null ? "Added" : newValue == null ? "Removed" : "Updated";
}

function getProfileChangeResponse(oldProfile: AuditProfile, newProfile: User | GuildMember): ProfileChangeResponse {
	const isMemberProfile = "roles" in newProfile;
	const oldUser = oldProfile as PartialUser | User;
	const newUser = newProfile as User;
	const oldMember = oldProfile as PartialGuildMember | GuildMember;
	const newMember = newProfile as GuildMember;
	const usernameChanged = !isMemberProfile && oldUser.username !== newUser.username;
	const globalNameChanged = !isMemberProfile && oldUser.globalName !== newUser.globalName;
	const nicknameChanged = isMemberProfile && oldMember.nickname !== newMember.nickname;
	const oldRoleIds = isMemberProfile ? new Set(oldMember.roles.cache.keys()) : new Set<string>();
	const newRoleIds = isMemberProfile ? new Set(newMember.roles.cache.keys()) : new Set<string>();
	const addedRoleIds = [...newRoleIds].filter((roleId) => !oldRoleIds.has(roleId));
	const removedRoleIds = [...oldRoleIds].filter((roleId) => !newRoleIds.has(roleId));
	const rolesChanged = addedRoleIds.length > 0 || removedRoleIds.length > 0;
	const timeoutChanged = Boolean(
		isMemberProfile && oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp,
	);
	const timeoutChangeLabel = getChangeLabel(
		oldMember.communicationDisabledUntilTimestamp,
		newMember.communicationDisabledUntilTimestamp,
	);
	const avatarChanged = oldProfile.avatar !== newProfile.avatar;
	const avatarChangeLabel = getChangeLabel(oldProfile.avatar, newProfile.avatar);
	const changes = [
		...(usernameChanged ? [{ name: "Username", label: "Updated", description: "updated their username" }] : []),
		...(globalNameChanged
			? [
					{
						name: "Display Name",
						label: getChangeLabel(oldUser.globalName, newUser.globalName),
						description: `${getChangeLabel(oldUser.globalName, newUser.globalName).toLowerCase()} their display name`,
					},
				]
			: []),
		...(nicknameChanged
			? [
					{
						name: "Nickname",
						label: getChangeLabel(oldMember.nickname, newMember.nickname),
						description: `${getChangeLabel(oldMember.nickname, newMember.nickname).toLowerCase()} a server nickname`,
					},
				]
			: []),
		...(rolesChanged ? [{ name: "Roles", label: "Updated", description: "updated their roles" }] : []),
		...(timeoutChanged
			? [
					{
						name: "Timeout",
						label: timeoutChangeLabel,
						description:
							timeoutChangeLabel === "Added"
								? "was timed out"
								: timeoutChangeLabel === "Removed"
									? "had their timeout removed"
									: "had their timeout updated",
					},
				]
			: []),
		...(avatarChanged
			? [
					{
						name: isMemberProfile ? "Server Avatar" : "Avatar",
						label: avatarChangeLabel,
						description: `${avatarChangeLabel.toLowerCase()} their ${isMemberProfile ? "server " : "profile "}avatar`,
					},
				]
			: []),
	];
	const singleChange = changes.length === 1 ? changes[0] : undefined;
	const title = singleChange
		? `${isMemberProfile ? "Member" : "User"} ${singleChange.name} ${singleChange.label}`
		: `${isMemberProfile ? "Member" : "User"} Profile Updated`;
	const description = singleChange
		? `${formatUserMention(newProfile.id)} ${singleChange.description}.`
		: `${formatUserMention(newProfile.id)} updated their ${isMemberProfile ? "server " : ""}profile.`;

	return {
		usernameChanged,
		globalNameChanged,
		nicknameChanged,
		rolesChanged,
		timeoutChanged,
		timeoutChangeLabel,
		avatarChanged,
		avatarChangeLabel,
		addedRoleIds,
		removedRoleIds,
		title,
		description,
	};
}

function addAvatarChange(embed: EmbedBuilder, oldAvatarUrl: string, newAvatarUrl: string, avatarLabel: string): void {
	embed
		.addFields(
			{ name: `Old ${avatarLabel} (Thumbnail)`, value: `[View Avatar](${oldAvatarUrl})`, inline: true },
			{ name: `New ${avatarLabel} (Image)`, value: `[View Avatar](${newAvatarUrl})`, inline: true },
		)
		.setThumbnail(oldAvatarUrl)
		.setImage(newAvatarUrl);
}

async function getRecentMemberUpdateExecutor(member: GuildMember): Promise<string> {
	const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate }).catch(() => null);
	const entry = auditLogs?.entries.find(
		(auditEntry) => auditEntry.target?.id === member.id && Date.now() - auditEntry.createdTimestamp < 20_000,
	);
	console.log("getRecentMemberUpdateExecutor", { member, auditLogs, entry });
	return entry?.executor ? `${formatUserMention(entry.executor.id)} (${entry.executor.tag})` : "Unknown";
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
	const commandMention = commandId ? chatInputApplicationCommandMention("auditlog", "on", commandId) : "`/auditlog on`";
	await sendGuildMessage({
		guild,
		content: `⚠️ Audit logging was automatically disabled because I can no longer access ${channelMention(channelId)}.\n📢 PSA for admins: please configure a new channel with ${commandMention}.`,
		failureMessage: "Failed to notify guild about disabled audit logging",
		details: { channelId },
	});
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
		.setDescription(`${formatUserMention(member.id)} joined the server.`)
		.addFields({ name: "User", value: `${formatUserMention(member.id)} (${member.user.tag})` })
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
		.setDescription(`${formatUserMention(member.id)} left the server.`)
		.addFields({ name: "User", value: `${formatUserMention(member.id)} (${member.user.tag})` })
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

	const fields: { name: string; value: string; inline?: boolean }[] = [
		{ name: "User", value: formatUserMention(newMember.id), inline: true },
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
		fields.push(
			{
				name: "Added Roles",
				value:
					profileChange.addedRoleIds.length > 0
						? profileChange.addedRoleIds.map((roleId) => roleMention(roleId)).join(" ")
						: "No roles",
			},
			{
				name: "Removed Roles",
				value:
					profileChange.removedRoleIds.length > 0
						? profileChange.removedRoleIds.map((roleId) => roleMention(roleId)).join(" ")
						: "No roles",
			},
		);
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
		fields.push({ name: "Action Initiated By", value: await getRecentMemberUpdateExecutor(newMember) });
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
	if (profileChange.avatarChanged) {
		addAvatarChange(
			embed,
			oldMember.displayAvatarURL({ size: 256 }),
			newMember.displayAvatarURL({ size: 256 }),
			"Server Avatar",
		);
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
	const channel = invite.channelId ? channelMention(invite.channelId) : "Unknown channel";
	const createdAt = invite.createdTimestamp ? `<t:${Math.floor(invite.createdTimestamp / 1000)}:F>` : "Unknown";
	const expiresAt = invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : "Never";
	const embed = new EmbedBuilder()
		.setColor("Aqua")
		.setTitle("Audit Event: Invite Created")
		.setDescription(`${formatUserMention(invite.inviterId)} created an invite.`)
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
	const channel = invite.channelId ? channelMention(invite.channelId) : "Unknown channel";
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
				.addFields({ name: "User", value: formatUserMention(newUser.id), inline: true })
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
				addAvatarChange(
					embed,
					oldUser.displayAvatarURL({ size: 256 }),
					newUser.displayAvatarURL({ size: 256 }),
					"Avatar",
				);
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
	const oldEmbeds = JSON.stringify(oldMessage.embeds.map((embed) => embed.toJSON()));
	const newEmbeds = JSON.stringify(newMessage.embeds.map((embed) => embed.toJSON()));
	const contentChanged = oldMessageWasNotCached || oldMessage.content !== newMessage.content;
	const embedsChanged = oldMessageWasNotCached || oldEmbeds !== newEmbeds;
	if (!contentChanged && !embedsChanged) {
		return;
	}
	const auditEventId = createAuditEventId();
	const hasEmbedFollowUp = embedsChanged && newMessage.embeds.length > 0;
	const previousContent = oldMessage.content ?? "";
	const updatedContent = newMessage.content ?? "";
	const previousContentWasTrimmed = !oldMessageWasNotCached && previousContent.length > 1020;
	const updatedContentWasTrimmed = updatedContent.length > 1020;
	const updatedEmbeds = newMessage.embeds.map((originalEmbed) => originalEmbed.toJSON());
	const previousContentPageCount = previousContentWasTrimmed ? splitString(previousContent, 4000).length : 0;
	const updatedContentPageCount = updatedContentWasTrimmed ? splitString(updatedContent, 4000).length : 0;
	const contentFollowUpPageCount = previousContentPageCount + updatedContentPageCount;
	const followUpPageCount = contentFollowUpPageCount + (hasEmbedFollowUp ? updatedEmbeds.length : 0);
	const totalPageCount = 1 + followUpPageCount;
	const contentFollowUps = [
		...(previousContentWasTrimmed
			? createContentFollowUps(
					"Full Previous Content",
					previousContent,
					auditEventId,
					"Orange",
					newMessage.id,
					1,
					totalPageCount,
				)
			: []),
		...(updatedContentWasTrimmed
			? createContentFollowUps(
					"Full Updated Content",
					updatedContent,
					auditEventId,
					"Orange",
					newMessage.id,
					1 + previousContentPageCount,
					totalPageCount,
				)
			: []),
	];
	const updatedEmbedFollowUps = hasEmbedFollowUp
		? updatedEmbeds.map((originalEmbed, pageIndex) =>
				EmbedBuilder.from(originalEmbed).setTitle(
					`${originalEmbed.title ?? "Updated Embed"} (MID: ${newMessage.id}) (Page ${contentFollowUpPageCount + pageIndex + 2}/${totalPageCount})`,
				),
			)
		: [];
	const embed = new EmbedBuilder()
		.setColor("Orange")
		.setTitle(
			followUpPageCount > 0 ? `Audit Event: Message Edited (Page 1/${totalPageCount})` : "Audit Event: Message Edited",
		)
		.setDescription(
			oldMessageWasNotCached
				? "A message was edited, but the previous version was not cached. The updated content is shown below."
				: hasEmbedFollowUp
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
			{ name: "Author", value: `${formatUserMention(author.id)} (${author.tag})`, inline: true },
			{ name: "Channel", value: channelMention(newMessage.channel.id), inline: true },
			{ name: "Created At", value: `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:F>` },
			{ name: "Message ID", value: newMessage.id },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	await postAuditEvent(guild, {
		embeds: [embed, ...contentFollowUps, ...updatedEmbedFollowUps],
		allowedMentions: { parse: [] },
	});
}

export async function handleAuditMessageDelete(message: Message | PartialMessage): Promise<void> {
	if (!message.guild || message.partial || isOwnBot(message.guild, message.author.id)) {
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
			{ name: "Author", value: `${formatUserMention(message.author.id)} (${message.author.tag})` },
			{ name: "Channel", value: channelMention(message.channel.id) },
			{ name: "Created At", value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>` },
			{ name: "Message ID", value: message.id },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();
	const auditEmbeds: Array<APIEmbed | JSONEncodable<APIEmbed>> = [embed];
	if (hasFollowUp) {
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
						`**Original message (MID: ${message.id}) from ${formatUserMention(message.author.id)} (${message.author.tag}):**`,
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

	const auditEventId = createAuditEventId();
	const embed = new EmbedBuilder()
		.setColor("DarkRed")
		.setTitle("Audit Event: Bulk Messages Deleted")
		.setDescription(
			"Multiple messages were deleted at once. The original messages are included in the follow-up below.",
		)
		.addFields(
			{ name: "Messages Deleted", value: `${originalMessages.length}`, inline: true },
			{ name: "Channel", value: channelMention(firstMessage.channel.id), inline: true },
		)
		.setFooter({ text: `Audit Event ID: ${auditEventId}` })
		.setTimestamp();

	const auditEmbeds: Array<APIEmbed | JSONEncodable<APIEmbed>> = [embed];

	const pagePrefix = `Follow-up for Audit Event ID: ${auditEventId}\n\n`;
	const maxPageContentLength = 4096 - pagePrefix.length;
	const messageBlocks = originalMessages.flatMap((message, index) => {
		const author = message.author
			? `${formatUserMention(message.author.id)} (${message.author.tag})`
			: "Unknown author";
		const messageHeader = `**Message ${index + 1} (ID: ${message.id}) from ${author}:**`;
		const continuedMessageHeader = `**Message ${index + 1} (ID: ${message.id}) from ${author} (continued):**`;
		const attachments = [...message.attachments.values()]
			.map((attachment) => `[Attachment: ${attachment.name}](${attachment.url})`)
			.join(", ");
		const quotedContent = (message.content ?? "No text content.")
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
		const messageContent = [quotedContent, attachments ? `Attachments: ${attachments}` : ""].filter(Boolean).join("\n");
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
	const oldChannelMention = oldState.channelId ? channelMention(oldState.channelId) : "No channel";
	const newChannelMention = newState.channelId ? channelMention(newState.channelId) : "No channel";
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
		{ name: "User", value: `${formatUserMention(member.id)} (${member.user.tag})`, inline: !hasChannelChange },
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
