import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ContextMenuCommandBuilder,
	MessageContextMenuCommandInteraction,
	PermissionResolvable,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
	UserContextMenuCommandInteraction,
} from "discord.js";
import {
	ApplicationCommandType,
	ContextMenuCommandBuilder as ContextMenuCommandBuilderClass,
	SlashCommandBuilder,
} from "discord.js";
import type { Config } from "../services/config.js";

export type CommandCategory = "general" | "music" | "level" | "fun" | "moderator" | "admin";

export interface BotCommandData {
	readonly name: string;
	readonly description: string;
	readonly category: CommandCategory;
	readonly isDBDependant?: boolean;
	readonly defaultMemberPermissions?: PermissionResolvable;
	readonly requiredBotPermissions?: readonly PermissionResolvable[];
	readonly usageNotes?: readonly string[];
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
	readonly postExecute?: (context: BotCommandContext) => Promise<void>;
	readonly autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface BotContextMenuCommandContext {
	readonly interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction;
	readonly config: Config;
}

export interface BotContextMenuCommand {
	readonly data: ContextMenuCommandBuilder;
	readonly execute: (context: BotContextMenuCommandContext) => Promise<void>;
}

export function isBotCommand(value: unknown): value is BotCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotCommand>;
	return command.data instanceof SlashCommandBuilder && typeof command.execute === "function";
}

export function isBotContextMenuCommand(value: unknown): value is BotContextMenuCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotContextMenuCommand>;
	const commandType = command.data instanceof ContextMenuCommandBuilderClass ? command.data.toJSON().type : null;
	return (
		(commandType === ApplicationCommandType.Message || commandType === ApplicationCommandType.User) &&
		typeof command.execute === "function"
	);
}
