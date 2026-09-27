import type { Guild, Message } from "discord.js";

import { getGuildCommands } from "./commandLoader.js";
import type { Config } from "./config.js";
import { isAdminUser } from "./adminGuild.js";
import { logger } from "./logger.js";

const deploymentCommands = new Set(["deploy", "undeployguild"]);

function getDeploymentCommand(content: string): string | undefined {
	if (!content.startsWith("!")) {
		return undefined;
	}

	const command = content.slice(1).trim().split(/\s+/u)[0]?.toLowerCase();
	return command && deploymentCommands.has(command) ? command : undefined;
}

async function setGuildCommands(guild: Guild, shouldDeploy: boolean): Promise<number> {
	const guildCommands = shouldDeploy ? getGuildCommands().map((command) => command.data.toJSON()) : [];
	const registeredCommands = await guild.commands.set(guildCommands);
	return registeredCommands.size;
}

export async function handleAdminDeploymentMessage(message: Message, config: Config): Promise<boolean> {
	if (message.author.bot) {
		return false;
	}

	const command = getDeploymentCommand(message.content);
	if (!command) {
		return false;
	}

	if (!message.guild || !isAdminUser(message.author.id, config)) {
		logger.warn("ADMIN", "Unauthorized deployment message attempt", {
			command,
			userName: message.author.tag,
			userId: message.author.id,
			guildId: message.guildId,
		});
		await message.reply("⛔ You are not authorized to use this deployment command.");
		return true;
	}

	try {
		const shouldDeploy = command === "deploy";
		const count = await setGuildCommands(message.guild, shouldDeploy);
		await message.reply(
			shouldDeploy ? `✅ Deployed ${count} guild command${count === 1 ? "" : "s"}.` : "✅ Removed all guild commands.",
		);
		logger.info("ADMIN", "Guild command deployment updated by message", {
			command,
			userName: message.author.tag,
			userId: message.author.id,
			guildId: message.guild.id,
			count,
		});
		return true;
	} catch (error: unknown) {
		logger.error("ADMIN", "Guild command deployment failed", {
			command,
			userName: message.author.tag,
			userId: message.author.id,
			guildId: message.guild.id,
			error,
		});
		await message.reply("⛔ Guild command deployment failed.");
		return true;
	}
}
