import type { ApplicationCommand } from "discord.js";
import { Collection, PermissionsBitField } from "discord.js";

import type { BotCommand, BotCommandData, BotContextMenuCommand } from "../helpers/command.js";
import { isBotCommand, isBotContextMenuCommand } from "../helpers/command.js";
import about from "../commands/about.js";
import auditlog from "../commands/auditlog.js";
import createPurgeJob from "../commands/create-purge-job.js";
import purgeMessages from "../commands/purge-messages.js";
import doppelganger from "../commands/doppelganger.js";
import admin from "../commands/guildCommands/admin.js";
import generateMessages from "../commands/guildCommands/generateMessages.js";
import help from "../commands/help.js";
import leaderboard from "../commands/leaderboard.js";
import level from "../commands/level.js";
import lockVcRegion from "../commands/lockVcRegion.js";
import memberannounce from "../commands/memberannounce.js";
import ping from "../commands/ping.js";
import play from "../commands/play.js";
import playlist from "../commands/playlist.js";
import soundboard from "../commands/soundboard.js";
import warn from "../commands/warn.js";
export type {
	BotCommand,
	BotCommandContext,
	BotCommandData,
	BotContextMenuCommand,
	BotContextMenuCommandContext,
	CommandCategory,
} from "../helpers/command.js";

const globalCommandModules: readonly unknown[] = [
	about,
	auditlog,
	purgeMessages,
	doppelganger,
	help,
	leaderboard,
	level,
	lockVcRegion,
	memberannounce,
	ping,
	play,
	playlist,
	soundboard,
	warn,
];
const guildCommandModules: readonly unknown[] = [admin, generateMessages];
const globalContextMenuCommandModules: readonly unknown[] = [createPurgeJob];

let loadedCommands: Collection<string, BotCommand> | undefined;
let loadedGlobalCommands: Collection<string, BotCommand> | undefined;
let loadedGuildCommands: Collection<string, BotCommand> | undefined;
let loadedGlobalContextMenuCommands: Collection<string, BotContextMenuCommand> | undefined;
let registeredCommandIds: Collection<string, string> | undefined;

async function loadCommandModules(modules: readonly unknown[]): Promise<Collection<string, BotCommand>> {
	const commands = new Collection<string, BotCommand>();

	for (const commandModule of modules) {
		if (!isBotCommand(commandModule)) {
			throw new Error("Invalid command module");
		}

		if (commands.has(commandModule.data.name)) {
			throw new Error(`Duplicate command: ${commandModule.data.name}`);
		}

		commands.set(commandModule.data.name, commandModule);
	}

	return commands;
}

async function loadContextMenuCommandModules(
	modules: readonly unknown[],
): Promise<Collection<string, BotContextMenuCommand>> {
	const commands = new Collection<string, BotContextMenuCommand>();

	for (const commandModule of modules) {
		if (!isBotContextMenuCommand(commandModule)) {
			throw new Error("Invalid context menu command module");
		}

		if (commands.has(commandModule.data.name)) {
			throw new Error(`Duplicate context menu command: ${commandModule.data.name}`);
		}

		commands.set(commandModule.data.name, commandModule);
	}

	return commands;
}

export async function loadCommands(): Promise<Collection<string, BotCommand>> {
	loadedGlobalCommands = await loadCommandModules(globalCommandModules);
	loadedGuildCommands = await loadCommandModules(guildCommandModules);
	loadedGlobalContextMenuCommands = await loadContextMenuCommandModules(globalContextMenuCommandModules);
	loadedCommands = new Collection([...loadedGlobalCommands, ...loadedGuildCommands]);
	return loadedCommands;
}

export function getCommands(): Collection<string, BotCommand> {
	if (!loadedCommands) {
		throw new Error("Commands have not been loaded");
	}

	return loadedCommands;
}

export function getCommand(name: string): BotCommand | undefined {
	return getCommands().get(name);
}

export function getGlobalCommands(): Collection<string, BotCommand> {
	if (!loadedGlobalCommands) {
		throw new Error("Commands have not been loaded");
	}

	return loadedGlobalCommands;
}

export function getGlobalContextMenuCommands(): Collection<string, BotContextMenuCommand> {
	if (!loadedGlobalContextMenuCommands) {
		throw new Error("Context menu commands have not been loaded");
	}

	return loadedGlobalContextMenuCommands;
}

export function getContextMenuCommand(name: string): BotContextMenuCommand | undefined {
	return getGlobalContextMenuCommands().get(name);
}

export function getGlobalApplicationCommandData() {
	return [
		...getGlobalCommands().map((command) => command.data.toJSON()),
		...getGlobalContextMenuCommands().map((command) => command.data.toJSON()),
	];
}

export function getRequiredGlobalBotPermissions(): PermissionsBitField {
	const permissions = new PermissionsBitField();
	const addCommandPermissions = (command: BotCommandData): void => {
		permissions.add(...(command.requiredBotPermissions ?? []));
		for (const subcommand of command.subCommands ?? []) {
			addCommandPermissions(subcommand);
		}
	};
	for (const command of getGlobalCommands().values()) {
		addCommandPermissions(command.commandData);
	}
	return permissions;
}

export function getGuildCommands(): Collection<string, BotCommand> {
	if (!loadedGuildCommands) {
		throw new Error("Commands have not been loaded");
	}

	return loadedGuildCommands;
}

export function setRegisteredCommandIds(commands: Collection<string, ApplicationCommand>): void {
	registeredCommandIds = new Collection(commands.map((command) => [command.name, command.id]));
}

export function getCommandId(name: string): string | undefined {
	return registeredCommandIds?.get(name);
}
