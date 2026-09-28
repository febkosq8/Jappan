import type { Guild, Message } from "discord.js";
import { EmbedBuilder, channelMention } from "discord.js";

import { formatGuildMention } from "../helpers/discord.js";
import { isAdminUser } from "./adminGuild.js";
import { getGuildCommands } from "./commandLoader.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import { handlePrefixPing } from "./prefixPing.js";

type PrefixCommand = "ping" | "deployguild" | "undeployguild";
type DeploymentCommand = Exclude<PrefixCommand, "ping">;

export function getPrefixCommand(content: string): PrefixCommand | undefined {
	if (!content.startsWith("!")) {
		return undefined;
	}

	const command = content.slice(1).trim().split(/\s+/u)[0]?.toLowerCase();
	const validCommands: PrefixCommand[] = ["ping", "deployguild", "undeployguild"];
	if (validCommands.includes(command as PrefixCommand)) {
		return command as PrefixCommand;
	}
	return undefined;
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

async function handleAdminDeploymentMessage({
	message,
	config,
	command,
}: {
	message: Message;
	config: Config;
	command: DeploymentCommand;
}): Promise<boolean> {
	if (message.author.bot) {
		return false;
	}

	if (!message.guild || !isAdminUser(message.author.id, config)) {
		logger.warn("ADMIN", "Unauthorized deployment message attempt", {
			command,
			user: `${message.author.tag} <${message.author.id}>`,
			guild: message.guild ? `${message.guild.name} <${message.guild.id}>` : undefined,
		});
		await sendDeploymentResponse({ message, config, command, status: "⛔ Unauthorized" });
		return true;
	}

	try {
		const shouldDeploy = command === "deployguild";
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
			user: `${message.author.tag} <${message.author.id}>`,
			guild: `${message.guild.name} <${message.guild.id}>`,
			count,
		});
		return true;
	} catch (error: unknown) {
		logger.error("ADMIN", "Guild command deployment failed", {
			command,
			user: `${message.author.tag} <${message.author.id}>`,
			guild: `${message.guild.name} <${message.guild.id}>`,
			error,
		});
		await sendDeploymentResponse({ message, config, command, status: "⛔ Failed" });
		return true;
	}
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
		guild: message.guild ? `${message.guild.name} <${message.guild.id}>` : undefined,
		channel: message.channelId,
	});
	await message.react("🙌").catch(() => undefined);

	switch (command) {
		case "ping":
			await handlePrefixPing({ message, config });
			return;
		case "deployguild":
		case "undeployguild":
			await handleAdminDeploymentMessage({ message, config, command });
			return;
		default:
			return;
	}
}
