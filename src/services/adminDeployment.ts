import type { Client, Guild, Message } from "discord.js";

import { formatGuild } from "../helpers/discord.js";
import { getGuilds } from "../helpers/guild.js";
import { getGuildCommands } from "./commandLoader.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import { handlePrefixPing } from "./prefixPing.js";

type PrefixCommand = "ping";

export async function undeployGuildCommandsGlobally({
	client,
	deadlineAt,
}: {
	client: Client;
	deadlineAt: number;
}): Promise<{
	undeployedGuilds: Guild[];
	failedGuilds: Guild[];
	timeLimitReached: boolean;
}> {
	const guilds = getGuilds({ source: "discord" });
	const undeployedGuilds: Guild[] = [];
	const failedGuilds: Guild[] = [];
	let timeLimitReached = false;

	for (const guild of guilds) {
		if (Date.now() >= deadlineAt) {
			timeLimitReached = true;
			break;
		}
		try {
			const existingCommands = await guild.commands.fetch();
			if (existingCommands.size === 0) {
				logger.info("ADMIN", "Guild command undeployment skipped", {
					guild: formatGuild(guild),
					reason: "No guild commands registered",
				});
				continue;
			}

			const startedAt = performance.now();
			logger.info("ADMIN", "Guild command undeployment started", {
				guild: formatGuild(guild),
				existingCommandCount: existingCommands.size,
			});
			await guild.commands.set([]);
			undeployedGuilds.push(guild);
			logger.info("ADMIN", "Guild commands undeployed", {
				guild: formatGuild(guild),
				removedCommandCount: existingCommands.size,
				durationMs: Math.round(performance.now() - startedAt),
			});
		} catch (error: unknown) {
			failedGuilds.push(guild);
			logger.error("ADMIN", "Guild command undeployment failed", {
				guild: formatGuild(guild),
				error,
			});
		}
	}

	return {
		undeployedGuilds,
		failedGuilds,
		timeLimitReached,
	};
}

export function getPrefixCommand(content: string): PrefixCommand | undefined {
	if (!content.startsWith("!")) {
		return undefined;
	}

	const command = content.slice(1).trim().split(/\s+/u)[0]?.toLowerCase();
	return command === "ping" ? command : undefined;
}

export async function setGuildCommands(guild: Guild, shouldDeploy: boolean): Promise<number> {
	const guildCommands = shouldDeploy ? getGuildCommands().map((command) => command.data.toJSON()) : [];
	const registeredCommands = await guild.commands.set(guildCommands);
	return registeredCommands.size;
}

export async function handlePrefixMessage({
	message,
	config,
	command,
}: {
	message: Message;
	config: Config;
	command: PrefixCommand;
}): Promise<void> {
	logger.info("ADMIN", "Prefix message received", {
		command,
		user: `${message.author.tag} <${message.author.id}>`,
		guild: message.guild ? formatGuild(message.guild) : undefined,
		channel: message.channelId,
	});
	await message.react("🙌").catch(() => undefined);

	switch (command) {
		case "ping":
			await handlePrefixPing({ message, config });
			return;
		default:
			return;
	}
}
