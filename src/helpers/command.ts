import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

export interface BotCommand {
	readonly data: SlashCommandBuilder;
	readonly execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export function isBotCommand(value: unknown): value is BotCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotCommand>;
	return command.data instanceof SlashCommandBuilder && typeof command.execute === "function";
}
