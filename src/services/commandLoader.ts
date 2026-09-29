import type { ApplicationCommand } from "discord.js";
import { Collection } from "discord.js";

import type { BotCommand } from "../helpers/command.js";
import { isBotCommand } from "../helpers/command.js";
import about from "../commands/about.js";
import auditlog from "../commands/auditlog.js";
import clear from "../commands/clear.js";
import doppelganger from "../commands/doppelganger.js";
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
import adminBot from "../commands/guildCommands/adminBot.js";
import adminDeploy from "../commands/guildCommands/adminDeploy.js";
import adminGuild from "../commands/guildCommands/adminGuild.js";
export type { BotCommand, BotCommandContext, BotCommandData, CommandCategory } from "../helpers/command.js";

const globalCommandModules: readonly unknown[] = [
	about,
	auditlog,
	clear,
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
const guildCommandModules: readonly unknown[] = [adminBot, adminDeploy, adminGuild];

let loadedCommands: Collection<string, BotCommand> | undefined;
let loadedGlobalCommands: Collection<string, BotCommand> | undefined;
let loadedGuildCommands: Collection<string, BotCommand> | undefined;
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

export async function loadCommands(): Promise<Collection<string, BotCommand>> {
	loadedGlobalCommands = await loadCommandModules(globalCommandModules);
	loadedGuildCommands = await loadCommandModules(guildCommandModules);
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
