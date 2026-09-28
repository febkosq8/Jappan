import {
	channelMention,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { formatGuild, formatGuildMention } from "../../helpers/discord.js";
import { sendResponse } from "../../helpers/response.js";
import { wait } from "../../helpers/utils.js";
import { isAdminUser } from "../../services/adminGuild.js";
import { logger } from "../../services/logger.js";
import { handleShutdown } from "../../services/shutdown.js";

const commandData = {
	name: "admin-bot",
	description: "Inspect or control the bot process",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	hasSubCommands: true,
	subCommands: [
		{ name: "check-voice", description: "Show the bot's active voice connections", category: "admin" },
		{ name: "stop-bot", description: "Stop the bot process", category: "admin" },
	],
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand.setName("check-voice").setDescription("Show the bot's active voice connections"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("stop-bot")
				.setDescription("Stop the bot process")
				.addBooleanOption((option) =>
					option.setName("confirm").setDescription("Confirm stopping the bot").setRequired(true),
				),
		)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (!isAdminUser(interaction.user.id, config)) {
			logger.warn("ADMIN", "Unauthorized bot control attempt", {
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
				subcommand: interaction.options.getSubcommand(),
			});
			await interaction.editReply("⛔ You are not authorized to use this command.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "check-voice") {
			let connectionNumber = 0;
			const embeds = [...interaction.client.guilds.cache.values()].flatMap((guild) => {
				const voiceState = guild.members.me?.voice;
				const channel = voiceState?.channel;
				if (!channel) {
					return [];
				}

				connectionNumber += 1;
				return [
					new EmbedBuilder()
						.setColor("DarkButNotBlack")
						.setTitle(`Active voice connection #${connectionNumber}`)
						.addFields(
							{ name: "Guild", value: formatGuildMention(guild) },
							{ name: "Channel", value: `${channelMention(channel.id)} (${channel.name})` },
							{ name: "Member count", value: String(channel.members.size), inline: true },
							{ name: "Session ID", value: voiceState.sessionId ?? "Unknown", inline: true },
							{
								name: "Server deaf",
								value: voiceState.serverDeaf ? "Active" : "Not active",
								inline: true,
							},
							{
								name: "Server mute",
								value: voiceState.serverMute ? "Active" : "Not active",
								inline: true,
							},
						)
						.setTimestamp(),
				];
			});

			if (embeds.length === 0) {
				await interaction.editReply("✅ Voice status analysis: no active voice connections found.");
				return;
			}

			await sendResponse({
				destination: interaction,
				content: { embeds, flags: MessageFlags.Ephemeral },
			});
			return;
		}

		if (subcommand === "stop-bot") {
			if (interaction.options.getBoolean("confirm", true) !== true) {
				await interaction.editReply("⛔ Confirmation is required to stop the bot process.");
				return;
			}

			await interaction.editReply("✅ Stopping the bot process in 5 seconds.");
			return;
		}

		throw new Error(`Unsupported admin-bot subcommand: ${subcommand}`);
	},
	postExecute: async ({ interaction, config }) => {
		if (
			interaction.options.getSubcommand() !== "stop-bot" ||
			interaction.options.getBoolean("confirm", true) !== true ||
			!isAdminUser(interaction.user.id, config)
		) {
			return;
		}

		logger.warn("ADMIN", "Bot stop requested by admin command", {
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
		});
		await wait(5000);
		await handleShutdown("ADMIN_STOP_BOT");
	},
};

export default command;
