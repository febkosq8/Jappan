import type { Guild, Message } from "discord.js";
import { EmbedBuilder, channelMention } from "discord.js";

import { formatGuildMention } from "../helpers/discord.js";
import { isAdminUser } from "./adminGuild.js";
import { getGuildCommands } from "./commandLoader.js";
import type { Config } from "./config.js";
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

function createDeploymentEmbed({
	message,
	config,
	command,
	status,
}: {
	message: Message;
	config: Config;
	command: string;
	status: string;
}): EmbedBuilder {
	return new EmbedBuilder()
		.setColor("Orange")
		.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle("Guild command deployment results")
		.addFields(
			{ name: "Command", value: `\`!${command}\``, inline: true },
			{ name: "Status", value: status, inline: true },
			{
				name: "Invoked guild",
				value: message.guild ? formatGuildMention(message.guild) : "Direct message",
				inline: true,
			},
			{
				name: "Invoked channel",
				value: message.guildId ? channelMention(message.channelId) : "Direct message",
				inline: true,
			},
		)
		.setTimestamp();
}

async function sendDeploymentResponse({
	message,
	config,
	command,
	status,
}: {
	message: Message;
	config: Config;
	command: string;
	status: string;
}): Promise<void> {
	await message.author
		.send({ embeds: [createDeploymentEmbed({ message, config, command, status })] })
		.catch(() => undefined);
	await message.delete().catch(() => undefined);
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
		await sendDeploymentResponse({ message, config, command, status: "⛔ Unauthorized" });
		return true;
	}

	try {
		const shouldDeploy = command === "deploy";
		const count = await setGuildCommands(message.guild, shouldDeploy);
		await sendDeploymentResponse({
			message,
			config,
			command,
			status: shouldDeploy
				? `✅ Deployed ${count} guild command${count === 1 ? "" : "s"}`
				: "✅ Removed all guild commands",
		});
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
		await sendDeploymentResponse({ message, config, command, status: "⛔ Failed" });
		return true;
	}
}
