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
	readonly defaultMemberPermissions?: PermissionResolvable;
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
	readonly requiredUserPermissions: readonly string[];
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

function getRequiredUserPermissions(command: BotCommand, subcommandPermissions: readonly string[] = []): string[] {
	return [
		...new Set(
			[
				...(command.commandData.defaultMemberPermissions
					? [String(command.commandData.defaultMemberPermissions)]
					: []),
				...subcommandPermissions,
			].map(formatPermissionName),
		),
	];
}

function createCommandMention({
	commandName,
	subcommandName,
	commandId,
}: {
	commandName: string;
	subcommandName: string | undefined;
	commandId: string;
}): string {
	return subcommandName
		? chatInputApplicationCommandMention(commandName, subcommandName, commandId)
		: chatInputApplicationCommandMention(commandName, commandId);
}

function createDisplayEntry({
	command,
	commandData,
	commandId,
	parentPermissions,
	parentName,
	parentUserPermissions,
}: {
	command: BotCommand;
	commandData: BotCommand["commandData"];
	commandId: string | undefined;
	parentPermissions: readonly string[];
	parentName: string | undefined;
	parentUserPermissions: readonly string[];
}): CommandDisplayEntry {
	const requiredBotPermissions = getRequiredBotPermissions(command, [
		...parentPermissions,
		...(commandData.requiredBotPermissions ?? []).map(String),
	]);
	const requiredUserPermissions = getRequiredUserPermissions(command, [
		...parentUserPermissions,
		...(commandData.defaultMemberPermissions ? [String(commandData.defaultMemberPermissions)] : []),
	]);
	const entry: CommandDisplayEntry = {
		name: commandData.name,
		description: commandData.description,
		requiredUserPermissions,
		requiredBotPermissions,
		subCommands: [],
		...(commandId
			? {
					commandId,
					mention: createCommandMention({
						commandName: command.commandData.name,
						subcommandName: parentName ? commandData.name : undefined,
						commandId,
					}),
				}
			: {}),
	};
	if (commandData.hasSubCommands && commandData.subCommands?.length) {
		return {
			...entry,
			subCommands: commandData.subCommands.map((subcommand) =>
				createDisplayEntry({
					command,
					commandData: subcommand,
					commandId,
					parentPermissions: requiredBotPermissions,
					parentName: commandData.name,
					parentUserPermissions: requiredUserPermissions,
				}),
			),
		};
	}
	return entry;
}

export function getCommandDisplayEntries(command: BotCommand, commandId?: string): CommandDisplayEntry[] {
	return [
		createDisplayEntry({
			command,
			commandData: command.commandData,
			commandId,
			parentPermissions: [],
			parentName: undefined,
			parentUserPermissions: [],
		}),
	];
}

export function formatCommandPermissions(permissions: readonly string[]): string {
	return permissions.length > 0
		? `\n${bold("Required bot permissions:")} ${permissions.map((permission) => `\`${permission}\``).join(", ")}`
		: "";
}

export function formatCommandUserPermissions(permissions: readonly string[]): string {
	return `\n${bold("User access:")} ${permissions.length > 0 ? permissions.map((permission) => `\`${permission}\``).join(", ") : "Everyone"}`;
}

export function formatCommandDisplayEntry({
	entry,
	indent = "",
	number,
}: {
	entry: CommandDisplayEntry;
	indent?: string;
	number?: string | undefined;
}): string {
	const commandId = entry.commandId ? ` (\`${entry.commandId}\`)` : "";
	const children = entry.subCommands
		.map((subcommand, index) =>
			formatCommandDisplayEntry({
				entry: subcommand,
				indent: `${indent}  `,
				number: number ? `${number}.${index + 1}` : undefined,
			}),
		)
		.join("\n\n");
	const entryPrefix = indent ? "• " : "";
	const descriptionSeparator = "\n";
	return `${indent}${entryPrefix}${number ? `${number}. ` : ""}${underline(entry.mention ?? entry.name)}${commandId}${descriptionSeparator}${indent}${bold("Description:")} ${entry.description}${formatCommandUserPermissions(
		entry.requiredUserPermissions,
	)}${formatCommandPermissions(
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
