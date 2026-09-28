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

export function formatUserMention(user: UserMentionSource): string {
	const userId = user.id;
	const userName = "displayName" in user ? user.displayName : "username" in user ? user.username : userId;
	return `${userMention(userId)} (${userName}/${userId})`;
}

export function formatChannelMention(channel: Pick<GuildChannel | ThreadChannel, "id" | "name">): string {
	const channelId = channel.id;
	const channelName = channel.name;
	return `${channelMention(channelId)} (${channelName}/${channelId})`;
}

export function formatGuildMention(guild: Pick<Guild, "id" | "name">): string {
	return `${guild.name} ([\`${guild.id}\`](https://discord.com/channels/${guild.id}))`;
}

export function formatRoleMention(role: Pick<Role, "id" | "name">): string {
	return `${roleMention(role.id)} (${role.name}/${role.id})`;
}
