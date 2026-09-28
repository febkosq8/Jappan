import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	PermissionResolvable,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import {
	bold,
	chatInputApplicationCommandMention,
	PermissionFlagsBits,
	SlashCommandBuilder,
	underline,
} from "discord.js";
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

export interface CommandDisplayEntry {
	readonly name: string;
	readonly description: string;
	readonly commandId?: string;
	readonly mention?: string;
	readonly requiredBotPermissions: readonly string[];
	readonly subCommands: readonly CommandDisplayEntry[];
}

function formatPermissionName(permission: string): string {
	const permissionKey = Object.entries(PermissionFlagsBits).find(([, value]) => String(value) === permission)?.[0];
	return (permissionKey ?? permission).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function getRequiredBotPermissions(command: BotCommand, subcommandPermissions: readonly string[] = []): string[] {
	return [
		...new Set([
			...(command.commandData.requiredBotPermissions ?? []).map(String).map(formatPermissionName),
			...subcommandPermissions.map(formatPermissionName),
		]),
	];
}

function createCommandMention(commandName: string, subcommandName: string | undefined, commandId: string): string {
	return subcommandName
		? chatInputApplicationCommandMention(commandName, subcommandName, commandId)
		: chatInputApplicationCommandMention(commandName, commandId);
}

function createDisplayEntry(
	command: BotCommand,
	commandData: BotCommand["commandData"],
	commandId: string | undefined,
	parentPermissions: readonly string[],
	parentName: string | undefined,
): CommandDisplayEntry {
	const requiredBotPermissions = getRequiredBotPermissions(command, [
		...parentPermissions,
		...(commandData.requiredBotPermissions ?? []).map(String),
	]);
	const entry: CommandDisplayEntry = {
		name: commandData.name,
		description: commandData.description,
		requiredBotPermissions,
		subCommands: [],
		...(commandId
			? {
					commandId,
					mention: createCommandMention(
						command.commandData.name,
						parentName ? commandData.name : undefined,
						commandId,
					),
				}
			: {}),
	};
	if (commandData.hasSubCommands && commandData.subCommands?.length) {
		return {
			...entry,
			subCommands: commandData.subCommands.map((subcommand) =>
				createDisplayEntry(command, subcommand, commandId, requiredBotPermissions, commandData.name),
			),
		};
	}
	return entry;
}

export function getCommandDisplayEntries(command: BotCommand, commandId?: string): CommandDisplayEntry[] {
	return [createDisplayEntry(command, command.commandData, commandId, [], undefined)];
}

export function formatCommandPermissions(permissions: readonly string[]): string {
	return permissions.length > 0
		? `\n${bold("Required permissions:")} ${permissions.map((permission) => `\`${permission}\``).join(", ")}`
		: "";
}

export function formatCommandDisplayEntry(entry: CommandDisplayEntry, indent = "", number?: string): string {
	const commandId = entry.commandId ? ` (\`${entry.commandId}\`)` : "";
	const children = entry.subCommands
		.map((subcommand, index) =>
			formatCommandDisplayEntry(subcommand, `${indent}  `, number ? `${number}.${index + 1}` : undefined),
		)
		.join("\n\n");
	const entryPrefix = indent ? "• " : "";
	const descriptionSeparator = "\n";
	return `${indent}${entryPrefix}${number ? `${number}. ` : ""}${underline(entry.mention ?? entry.name)}${commandId}${descriptionSeparator}${indent}${bold("Description:")} ${entry.description}${formatCommandPermissions(
		entry.requiredBotPermissions,
	)}${children ? `\n\n${indent}${bold("Subcommands:")}\n${children}` : ""}`;
}

export function isBotCommand(value: unknown): value is BotCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotCommand>;
	return command.data instanceof SlashCommandBuilder && typeof command.execute === "function";
}
