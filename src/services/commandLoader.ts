import type { ApplicationCommand } from "discord.js";
import { Collection } from "discord.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { BotCommand } from "../helpers/command.js";
import { isBotCommand } from "../helpers/command.js";
export type { BotCommand, BotCommandContext, BotCommandData, CommandCategory } from "../helpers/command.js";

type CommandModule = {
	readonly default?: unknown;
};

let loadedCommands: Collection<string, BotCommand> | undefined;
let loadedGlobalCommands: Collection<string, BotCommand> | undefined;
let loadedGuildCommands: Collection<string, BotCommand> | undefined;
let registeredCommandIds: Collection<string, string> | undefined;

async function loadCommandDirectory(commandDirectory: string): Promise<Collection<string, BotCommand>> {
	const entries = await readdir(commandDirectory, { withFileTypes: true });
	const commands = new Collection<string, BotCommand>();

	for (const entry of entries) {
		if (
			!entry.isFile() ||
			entry.name.endsWith(".d.ts") ||
			!(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))
		) {
			continue;
		}

		const commandPath = join(commandDirectory, entry.name);
		const commandModule = (await import(pathToFileURL(commandPath).href)) as CommandModule;
		if (!isBotCommand(commandModule.default)) {
			throw new Error(`Invalid command module: ${entry.name}`);
		}

		if (commands.has(commandModule.default.data.name)) {
			throw new Error(`Duplicate command: ${commandModule.default.data.name}`);
		}

		commands.set(commandModule.default.data.name, commandModule.default);
	}

	return commands;
}

export async function loadCommands(): Promise<Collection<string, BotCommand>> {
	const commandDirectory = fileURLToPath(new URL("../commands", import.meta.url));
	const guildCommandDirectory = join(commandDirectory, "guildCommands");
	loadedGlobalCommands = await loadCommandDirectory(commandDirectory);
	loadedGuildCommands = await loadCommandDirectory(guildCommandDirectory);
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
