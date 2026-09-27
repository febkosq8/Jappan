import { userMention } from "discord.js";

export function formatUserMention(userId: string): string {
	return `${userMention(userId)} (${userId})`;
}
