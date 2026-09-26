import { SlashCommandBuilder } from "discord.js";
import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface BotCommandData {
	readonly name: string;
	readonly description: string;
	readonly isDBDependant?: boolean;
}

export interface BotCommand {
	readonly commandData: BotCommandData;
	readonly data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	readonly execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
	readonly autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export function isBotCommand(value: unknown): value is BotCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotCommand>;
	return command.data instanceof SlashCommandBuilder && typeof command.execute === "function";
}
