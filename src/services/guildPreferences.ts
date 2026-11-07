import { PermissionFlagsBits, type Guild } from "discord.js";

import { canAssignRole } from "./adminGuild.js";
import { setAuditLog } from "./auditLog.js";
import { setLeveling } from "./leveling.js";
import { setMemberAnnouncement } from "./memberAnnouncement.js";
import { setWarningSettings } from "./warnings.js";

export type PreferenceUpdateResult = { status: "ok" } | { status: "invalid"; error: string };

const ok: PreferenceUpdateResult = { status: "ok" };
const invalid = (error: string): PreferenceUpdateResult => ({ status: "invalid", error });

async function validateChannel(
	guild: Guild,
	channelId: string,
	extraPermissions: bigint[] = [],
): Promise<string | null> {
	const channel = await guild.channels.fetch(channelId).catch(() => null);
	if (!channel?.isTextBased()) return "Channel must be a text channel in this guild";
	const botMember = guild.members.me ?? (await guild.members.fetchMe());
	const permissions = channel.permissionsFor(botMember);
	if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, ...extraPermissions])) {
		return "Bot needs View Channel and Send Messages in that channel";
	}
	return null;
}

export async function updateAuditLogPreference({
	guild,
	enabled,
	channelId,
	fullVerbosity,
}: {
	guild: Guild;
	enabled: boolean;
	channelId: string | null;
	fullVerbosity: boolean;
}): Promise<PreferenceUpdateResult> {
	if (enabled) {
		if (!channelId) return invalid("A channel is required to enable the audit log");
		const botMember = guild.members.me ?? (await guild.members.fetchMe());
		if (!botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
			return invalid("Bot needs View Audit Log permission in this guild");
		}
		const channelError = await validateChannel(guild, channelId);
		if (channelError) return invalid(channelError);
	}
	await setAuditLog({
		guildId: guild.id,
		guildName: guild.name,
		enabled,
		channelId: enabled ? channelId : null,
		fullVerbosity: enabled && fullVerbosity,
	});
	return ok;
}

export async function updateLevelingPreference({
	guild,
	enabled,
	threshold,
	roleId,
}: {
	guild: Guild;
	enabled: boolean;
	threshold: number | null;
	roleId: string | null;
}): Promise<PreferenceUpdateResult> {
	if (enabled && (threshold === null) !== (roleId === null)) {
		return invalid("Threshold and role must be set together");
	}
	if (enabled && roleId !== null) {
		const botMember = guild.members.me ?? (await guild.members.fetchMe());
		const canManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
		if (!canManageRoles) return invalid("Bot needs Manage Roles permission in this guild");
		const role = await guild.roles.fetch(roleId).catch(() => null);
		if (!role) return invalid("Role was not found in this guild");
		if (!canAssignRole(role, botMember, canManageRoles)) {
			return invalid("Role must not be @everyone or managed, and must be below the bot's highest role");
		}
	}
	await setLeveling({
		guildId: guild.id,
		guildName: guild.name,
		enabled,
		threshold: enabled ? threshold : null,
		roleId: enabled ? roleId : null,
	});
	return ok;
}

export async function updateMemberAnnouncementsPreference({
	guild,
	joinEnabled,
	joinChannelId,
	leaveEnabled,
	leaveChannelId,
}: {
	guild: Guild;
	joinEnabled: boolean;
	joinChannelId: string | null;
	leaveEnabled: boolean;
	leaveChannelId: string | null;
}): Promise<PreferenceUpdateResult> {
	const events = [
		{ event: "join", enabled: joinEnabled, channelId: joinChannelId },
		{ event: "leave", enabled: leaveEnabled, channelId: leaveChannelId },
	] as const;
	for (const { event, enabled, channelId } of events) {
		if (!enabled) continue;
		if (!channelId) return invalid(`A ${event} channel is required to enable ${event} announcements`);
		const channelError = await validateChannel(guild, channelId);
		if (channelError) return invalid(`${event[0]?.toUpperCase()}${event.slice(1)} channel: ${channelError}`);
	}
	for (const { event, enabled, channelId } of events) {
		await setMemberAnnouncement({
			guildId: guild.id,
			guildName: guild.name,
			event,
			enabled,
			...(enabled && channelId ? { channelId } : {}),
		});
	}
	return ok;
}

export async function updateWarningsPreference({
	guild,
	timeoutThreshold,
	timeoutDurationHours,
	banThreshold,
	auditChannelId,
}: {
	guild: Guild;
	timeoutThreshold: number | null;
	timeoutDurationHours: number | null;
	banThreshold: number | null;
	auditChannelId: string | null;
}): Promise<PreferenceUpdateResult> {
	if (timeoutThreshold !== null && timeoutDurationHours === null) {
		return invalid("A timeout duration is required when a timeout threshold is set");
	}
	if (timeoutThreshold !== null && banThreshold !== null && banThreshold <= timeoutThreshold) {
		return invalid("Ban threshold must be greater than the timeout threshold");
	}
	if (auditChannelId) {
		const channelError = await validateChannel(guild, auditChannelId);
		if (channelError) return invalid(channelError);
	}
	await setWarningSettings({
		guildId: guild.id,
		guildName: guild.name,
		timeoutThreshold,
		timeoutDurationHours: timeoutThreshold === null ? null : timeoutDurationHours,
		banThreshold,
		auditChannelId,
	});
	return ok;
}
