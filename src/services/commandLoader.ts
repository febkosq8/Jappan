import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Collection } from "discord.js";
import type { ApplicationCommand } from "discord.js";

import { isBotCommand } from "../helpers/command.js";
import { logger } from "./logger.js";

export type { BotCommand, BotCommandData } from "../helpers/command.js";
import type { BotCommand } from "../helpers/command.js";

type CommandModule = {
	readonly default?: unknown;
};

let loadedCommands: Collection<string, BotCommand> | undefined;
let registeredCommandIds: Collection<string, string> | undefined;

export async function loadCommands(): Promise<Collection<string, BotCommand>> {
	const commandDirectory = fileURLToPath(new URL("../commands", import.meta.url));
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

	loadedCommands = commands;
	return loadedCommands;
}

export function getCommands(): Collection<string, BotCommand> {
	if (!loadedCommands) {
		throw new Error("Commands have not been loaded");
	}

	return loadedCommands;
}

export function setRegisteredCommandIds(commands: Collection<string, ApplicationCommand>): void {
	registeredCommandIds = new Collection(commands.map((command) => [command.name, command.id]));
}

export function getCommandId(name: string): string | undefined {
	return registeredCommandIds?.get(name);
}
