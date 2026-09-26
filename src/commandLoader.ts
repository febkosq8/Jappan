import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { ChatInputCommandInteraction, Collection, SlashCommandBuilder } from "discord.js";

import { logger } from "./logger.js";

export interface BotCommand {
	readonly data: SlashCommandBuilder;
	readonly execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

type CommandModule = {
	readonly default?: unknown;
};

function isBotCommand(value: unknown): value is BotCommand {
	if (!value || typeof value !== "object") {
		return false;
	}

	const command = value as Partial<BotCommand>;
	return command.data instanceof SlashCommandBuilder && typeof command.execute === "function";
}

export async function loadCommands(): Promise<Collection<string, BotCommand>> {
	const commandDirectory = fileURLToPath(new URL("./commands", import.meta.url));
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

	logger.info("COMMANDS", "Commands loaded", { count: commands.size });
	return commands;
}
