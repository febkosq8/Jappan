import { channelMention, roleMention, userMention } from "discord.js";
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

export function formatUserMention(user: User | PartialUser | GuildMember | PartialGuildMember): string {
	const userId = user.id;
	const userName = "user" in user ? user.displayName : user.username;
	return `${userMention(userId)} (${userName}/${userId})`;
}

export function formatChannelMention(channel: GuildChannel | ThreadChannel): string {
	const channelId = channel.id;
	const channelName = channel.name;
	return `${channelMention(channelId)} (${channelName}/${channelId})`;
}

export function formatGuildMention(guild: Pick<Guild, "id" | "name">): string {
	return `${guild.name} ([\`${guild.id}\`](https://discord.com/channels/${guild.id}))`;
}

export function formatRoleMention(role: Role): string {
	return `${roleMention(role.id)} (${role.name}/${role.id})`;
}
