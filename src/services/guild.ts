import type { Guild as DiscordGuild } from "discord.js";
import { EmbedBuilder, chatInputApplicationCommandMention } from "discord.js";

import { sendGuildMessage } from "../helpers/guildHelper.js";
import GuildModel, { type GuildDocument } from "../models/guild.js";
import { getCommandId } from "./commandLoader.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

export interface GuildSettingsOptions {
	guildId?: string;
	guildName?: string;
	guild?: DiscordGuild;
}

export async function getGuildSettings({ guildId, guildName, guild }: GuildSettingsOptions): Promise<GuildDocument> {
	const resolvedGuildId = guild?.id ?? guildId;
	const resolvedGuildName = guild?.name ?? guildName;
	if (!resolvedGuildId || !resolvedGuildName) {
		throw new Error("Guild ID and guild name are required when guild is not provided");
	}

	let storedGuildData = await GuildModel.findOne({ guildId: resolvedGuildId }).exec();
	if (!storedGuildData) {
		storedGuildData = await GuildModel.create({ guildId: resolvedGuildId, guildName: resolvedGuildName });
	}

	if (storedGuildData.guildName !== resolvedGuildName) {
		storedGuildData.guildName = resolvedGuildName;
		await storedGuildData.save();
	}

	return storedGuildData;
}

export async function initializeGuild(guild: DiscordGuild): Promise<void> {
	try {
		await getGuildSettings({ guild });
		logger.info("DISCORD", "Guild initialized", {
			guildId: guild.id,
			guildName: guild.name,
		});

		const helpCommandId = getCommandId("help");
		const helpCommand = helpCommandId
			? chatInputApplicationCommandMention("help", helpCommandId)
			: "the command menu";
		const config = getConfig();
		const welcomeEmbed = new EmbedBuilder()
			.setColor("Orange")
			.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setTitle(`Thanks for inviting ${config.BOT_NAME}!`)
			.setDescription(`I'm ready to help ${guild.name} with everyday server management and community tools.`)
			.addFields(
				{ name: "Leveling", value: "Reward active members and track activity.", inline: true },
				{ name: "Moderation", value: "Manage warnings and keep your server organized.", inline: true },
				{ name: "Announcements", value: "Welcome new members and track server activity.", inline: true },
			)
			.addFields({ name: "Get started", value: `Use ${helpCommand} to explore the available commands.` })
			.setFooter({ text: "Jappan is ready to help." })
			.setTimestamp();
		const welcomeContent = [
			`Thanks for inviting me to ${guild.name}!`,
			"",
			"I'm ready to help with:",
			"- Leveling and activity rewards",
			"- Moderation and warnings",
			"- Member announcements and server tools",
			"",
			`Use ${helpCommand} to explore the available commands.`,
		].join("\n");
		let delivered = await sendGuildMessage({
			guild,
			content: { embeds: [welcomeEmbed] },
			failureMessage: "Failed to send guild initialization embed",
			details: { guildName: guild.name },
		});
		if (!delivered) {
			delivered = await sendGuildMessage({
				guild,
				content: welcomeContent,
				failureMessage: "Failed to send guild initialization fallback message",
				details: { guildName: guild.name },
			});
		}
		if (delivered) {
			logger.info("DISCORD", "Guild initialization message sent", {
				guildId: guild.id,
				guildName: guild.name,
				channelId: delivered.channelId,
				channelName: delivered.channelName,
				messageType: delivered.messageType,
			});
		} else {
			logger.warn("DISCORD", "No suitable channel was available for guild initialization message", {
				guildId: guild.id,
				guildName: guild.name,
			});
		}
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to initialize guild", {
			guildId: guild.id,
			guildName: guild.name,
			error,
		});
	}
}
