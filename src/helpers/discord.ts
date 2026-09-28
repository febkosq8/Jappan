import type {
	Guild,
	GuildChannel,
	GuildMember,
	PartialGuildMember,
	PartialUser,
	Role,
	ThreadChannel,
	User,
} from "discord.js";
import { channelMention, roleMention, userMention } from "discord.js";

type UserMentionSource =
	| Pick<User, "id" | "username">
	| Pick<PartialUser, "id" | "username">
	| Pick<GuildMember, "id" | "displayName">
	| Pick<PartialGuildMember, "id" | "displayName">;

export function formatUser(user: UserMentionSource): string {
	const userName = "displayName" in user ? user.displayName : (user.username ?? user.id);
	return `${userName} <${user.id}>`;
}
export function formatGuild(guild: Pick<Guild, "id" | "name">): string {
	return `${guild.name} <${guild.id}>`;
}

export function formatChannel(channel: Pick<GuildChannel | ThreadChannel, "id" | "name">): string {
	return `${channel.name} <${channel.id}>`;
}

export function formatRole(role: Pick<Role, "id" | "name">): string {
	return `${role.name} <${role.id}>`;
}

export function formatUserMention(user: UserMentionSource): string {
	return `${userMention(user.id)} (${formatUser(user)})`;
}

export function formatGuildMention(guild: Pick<Guild, "id" | "name">): string {
	return `[${formatGuild(guild)}](https://discord.com/channels/${guild.id})`;
}

export function formatChannelMention(channel: Pick<GuildChannel | ThreadChannel, "id" | "name">): string {
	return `${channelMention(channel.id)} (${formatChannel(channel)})`;
}

export function formatRoleMention(role: Pick<Role, "id" | "name">): string {
	return `${roleMention(role.id)} (${formatRole(role)})`;
}
