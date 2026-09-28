import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	PermissionResolvable,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import type { Config } from "../services/config.js";

export type CommandCategory = "general" | "music" | "level" | "fun" | "moderator" | "admin";

export interface BotCommandData {
	readonly name: string;
	readonly description: string;
	readonly category: CommandCategory;
	readonly isDBDependant?: boolean;
	readonly requiredBotPermissions?: readonly PermissionResolvable[];
	readonly hasSubCommands?: boolean;
	readonly subCommands?: readonly BotCommandData[];
}

export interface BotCommandContext {
	readonly interaction: ChatInputCommandInteraction;
	readonly config: Config;
}

export interface BotCommand {
	readonly commandData: BotCommandData;
	readonly data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	readonly execute: (context: BotCommandContext) => Promise<void>;
	readonly autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export function isBotCommand(value: unknown): value is BotCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotCommand>;
	return command.data instanceof SlashCommandBuilder && typeof command.execute === "function";
}
