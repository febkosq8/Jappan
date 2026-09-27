import { randomUUID } from "node:crypto";
import { AuditLogEvent, ChannelType, EmbedBuilder, VideoQualityMode, blockQuote } from "discord.js";
import type {
	APIEmbed,
	Guild,
	GuildAuditLogsEntry,
	GuildChannel,
	GuildMember,
	JSONEncodable,
	PartialGuildMember,
	PartialUser,
	Role,
	ThreadChannel,
	User,
} from "discord.js";

import { formatUserMention } from "./discord.js";
import { splitString } from "./string.js";

export const MAX_EMBEDS_PER_MESSAGE = 10;
export const MAX_EMBED_CHARACTERS_PER_MESSAGE = 6000;

export function formatAuditValue(value: string | number | null | undefined): string {
	return value === null || value === undefined || value === "" ? "None" : `\`${value}\``;
}

export function getVideoQualityModeLabel(mode: VideoQualityMode | null): string | null {
	return mode === VideoQualityMode.Auto ? "Auto" : mode === VideoQualityMode.Full ? "Full" : null;
}

export function getRoleChangeDetails(oldRole: Role, newRole: Role): string[] {
	const changes: string[] = [];
	if (oldRole.name !== newRole.name) {
		changes.push(`Name: ${formatAuditValue(oldRole.name)} -> ${formatAuditValue(newRole.name)}`);
	}
	if (oldRole.hexColor !== newRole.hexColor) {
		changes.push(`Color: ${formatAuditValue(oldRole.hexColor)} -> ${formatAuditValue(newRole.hexColor)}`);
	}
	if (oldRole.hoist !== newRole.hoist) {
		changes.push(
			`Displayed separately: ${formatAuditValue(oldRole.hoist ? "Yes" : "No")} -> ${formatAuditValue(newRole.hoist ? "Yes" : "No")}`,
		);
	}
	if (oldRole.mentionable !== newRole.mentionable) {
		changes.push(
			`Mentionable: ${formatAuditValue(oldRole.mentionable ? "Yes" : "No")} -> ${formatAuditValue(newRole.mentionable ? "Yes" : "No")}`,
		);
	}
	if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
		const oldPermissions = new Set(oldRole.permissions.toArray());
		const newPermissions = new Set(newRole.permissions.toArray());
		const addedPermissions = [...newPermissions].filter((permission) => !oldPermissions.has(permission));
		const removedPermissions = [...oldPermissions].filter((permission) => !newPermissions.has(permission));
		changes.push(
			`Permissions: ${addedPermissions.length} added (${addedPermissions.map((permission) => formatAuditValue(permission)).join(", ")}); ${removedPermissions.length} removed (${removedPermissions.map((permission) => formatAuditValue(permission)).join(", ")})`,
		);
	}
	if (oldRole.position !== newRole.position) {
		changes.push(`Position: ${formatAuditValue(oldRole.position)} -> ${formatAuditValue(newRole.position)}`);
	}
	if (oldRole.unicodeEmoji !== newRole.unicodeEmoji) {
		changes.push(
			`Unicode Emoji: ${formatAuditValue(oldRole.unicodeEmoji)} -> ${formatAuditValue(newRole.unicodeEmoji)}`,
		);
	}
	return changes;
}

export function getRoleCreationDetails(role: Role): { name: string; value: string; inline?: boolean }[] {
	const details: { name: string; value: string; inline?: boolean }[] = [
		{ name: "Name", value: formatAuditValue(role.name) },
	];
	const permissions = role.permissions.toArray();
	if (permissions.length > 0) {
		details.push({ name: "Permissions", value: formatAuditValue(permissions.join(", ")) });
	}
	if (role.hexColor !== "#000000") {
		details.push({ name: "Color", value: formatAuditValue(role.hexColor), inline: true });
	}
	if (role.colors.secondaryColor !== null || role.colors.tertiaryColor !== null) {
		details.push({
			name: "Additional Colors",
			value: formatAuditValue(
				[
					role.colors.secondaryColor !== null ? `Secondary: ${role.colors.secondaryColor}` : null,
					role.colors.tertiaryColor !== null ? `Tertiary: ${role.colors.tertiaryColor}` : null,
				]
					.filter(Boolean)
					.join(", "),
			),
		});
	}
	if (role.hoist) {
		details.push({ name: "Displayed Separately", value: "Yes", inline: true });
	}
	if (role.mentionable) {
		details.push({ name: "Mentionable", value: "Yes", inline: true });
	}
	if (role.unicodeEmoji) {
		details.push({ name: "Unicode Emoji", value: formatAuditValue(role.unicodeEmoji), inline: true });
	}
	if (role.managed) {
		details.push({ name: "Managed", value: "Yes", inline: true });
	}
	const flags = role.flags.toArray();
	if (flags.length > 0) {
		details.push({ name: "Flags", value: formatAuditValue(flags.join(", ")) });
	}
	if (role.tags) {
		const tags = Object.entries(role.tags)
			.filter(([, value]) => value !== null && value !== undefined && value !== false)
			.map(([name, value]) => `${name}: ${value}`);
		if (tags.length > 0) {
			details.push({ name: "Tags", value: formatAuditValue(tags.join(", ")) });
		}
	}
	return details;
}

export function getEmbedCharacterCount(embed: APIEmbed | JSONEncodable<APIEmbed>): number {
	const serializedEmbed = "toJSON" in embed ? embed.toJSON() : embed;
	return [
		serializedEmbed.author?.name,
		serializedEmbed.title,
		serializedEmbed.description,
		serializedEmbed.footer?.text,
		...(serializedEmbed.fields ?? []).flatMap((field) => [field.name, field.value]),
	].reduce((total, value) => total + (value?.length ?? 0), 0);
}

export function createAuditEventId(): string {
	return randomUUID();
}

export function createContentFollowUps(
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

export function isOwnBot(guild: Guild, userId: string): boolean {
	return guild.client.user?.id === userId;
}

export type AuditProfile = User | PartialUser | GuildMember | PartialGuildMember;

export interface ProfileChangeResponse {
	readonly usernameChanged: boolean;
	readonly globalNameChanged: boolean;
	readonly nicknameChanged: boolean;
	readonly rolesChanged: boolean;
	readonly timeoutChanged: boolean;
	readonly timeoutChangeLabel: "Added" | "Removed" | "Updated";
	readonly avatarChanged: boolean;
	readonly avatarChangeLabel: "Added" | "Removed" | "Updated";
	readonly addedRoles: readonly Role[];
	readonly removedRoles: readonly Role[];
	readonly title: string;
	readonly description: string;
}

export async function getRecentAuditEntry(
	target: { guild: Guild; id: string },
	types: AuditLogEvent | readonly AuditLogEvent[],
): Promise<GuildAuditLogsEntry | undefined> {
	const auditTypes = Array.isArray(types) ? types : [types];
	const auditLogs = await Promise.all(
		auditTypes.map((type) => target.guild.fetchAuditLogs({ limit: 10, type }).catch(() => null)),
	);
	return auditLogs
		.flatMap((auditLog) => (auditLog ? [...auditLog.entries.values()] : []))
		.filter(
			(candidateAuditEntry) =>
				candidateAuditEntry.target &&
				"id" in candidateAuditEntry.target &&
				candidateAuditEntry.target.id === target.id &&
				Date.now() - candidateAuditEntry.createdTimestamp < 20_000,
		)
		.sort((firstEntry, secondEntry) => secondEntry.createdTimestamp - firstEntry.createdTimestamp)[0];
}

function getChangeLabel(
	oldValue: string | number | null | undefined,
	newValue: string | number | null | undefined,
): "Added" | "Removed" | "Updated" {
	return oldValue == null ? "Added" : newValue == null ? "Removed" : "Updated";
}

export function getProfileChangeResponse(
	oldProfile: AuditProfile,
	newProfile: User | GuildMember,
): ProfileChangeResponse {
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
	const addedRoles = [...newRoleIds]
		.filter((roleId) => !oldRoleIds.has(roleId))
		.map((roleId) => newMember.roles.cache.get(roleId))
		.filter((role): role is Role => Boolean(role));
	const removedRoles = [...oldRoleIds]
		.filter((roleId) => !newRoleIds.has(roleId))
		.map((roleId) => oldMember.roles.cache.get(roleId))
		.filter((role): role is Role => Boolean(role));
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
		? `${formatUserMention(newProfile)} ${singleChange.description}.`
		: `${formatUserMention(newProfile)} updated their ${isMemberProfile ? "server " : ""}profile.`;

	return {
		usernameChanged,
		globalNameChanged,
		nicknameChanged,
		rolesChanged,
		timeoutChanged,
		timeoutChangeLabel,
		avatarChanged,
		avatarChangeLabel,
		addedRoles,
		removedRoles,
		title,
		description,
	};
}

export function addAvatarChange(
	embed: EmbedBuilder,
	oldAvatarUrl: string,
	newAvatarUrl: string,
	avatarLabel: string,
): void {
	embed
		.addFields(
			{ name: `Old ${avatarLabel} (Thumbnail)`, value: `[View Avatar](${oldAvatarUrl})`, inline: true },
			{ name: `New ${avatarLabel} (Image)`, value: `[View Avatar](${newAvatarUrl})`, inline: true },
		)
		.setThumbnail(oldAvatarUrl)
		.setImage(newAvatarUrl);
}

export function getChannelTypeLabel(channel: GuildChannel | ThreadChannel): string {
	return channel.type === ChannelType.GuildText
		? "Text Channel"
		: channel.type === ChannelType.GuildVoice
			? "Voice Channel"
			: channel.type === ChannelType.GuildCategory
				? "Category"
				: channel.type === ChannelType.GuildAnnouncement
					? "Announcement Channel"
					: channel.type === ChannelType.GuildStageVoice
						? "Stage Channel"
						: channel.type === ChannelType.GuildForum
							? "Forum Channel"
							: channel.type === ChannelType.GuildMedia
								? "Media Channel"
								: channel.type === ChannelType.GuildPublicThread
									? "Public Thread"
									: channel.type === ChannelType.GuildPrivateThread
										? "Private Thread"
										: channel.type === ChannelType.GuildNewsThread
											? "Announcement Thread"
											: "Channel";
}

export function addAuditEntryDetails(embed: EmbedBuilder, auditEntry: GuildAuditLogsEntry | undefined): void {
	if (auditEntry?.executor) {
		embed.addFields({
			name: "Action Initiated By",
			value: formatUserMention(auditEntry.executor),
		});
	}
	if (auditEntry?.reason) {
		embed.addFields({ name: "Reason", value: auditEntry.reason });
	}
}
