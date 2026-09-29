import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import {
	formatChannel,
	formatChannelMention,
	formatGuild,
	formatGuildMention,
	formatUser,
	formatUserMention,
} from "../../helpers/discord.js";
import { sendResponse } from "../../helpers/response.js";
import { wait } from "../../helpers/utils.js";
import { isAdminUser } from "../../services/adminGuild.js";
import { logger } from "../../services/logger.js";
import { getActivePlayerSessions, runPlayerHealthCheck } from "../../services/player.js";
import { handleShutdown } from "../../services/shutdown.js";

const commandData = {
	name: "admin-bot",
	description: "Inspect or control the bot process",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	hasSubCommands: true,
	subCommands: [
		{ name: "check-player", description: "Show active player and voice sessions", category: "admin" },
		{ name: "refresh-player-health", description: "Refresh the player health status", category: "admin" },
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
			subcommand.setName("check-player").setDescription("Show active player and voice sessions"),
		)
		.addSubcommand((subcommand) =>
			subcommand.setName("refresh-player-health").setDescription("Refresh the player health status"),
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
		if (subcommand === "check-player") {
			const sessions = getActivePlayerSessions();
			const embeds = sessions.map((session, index) => {
				const guild = interaction.client.guilds.cache.get(session.guild.id);
				const voiceState = guild?.members.me?.voice;
				const channel = voiceState?.channel;
				return new EmbedBuilder()
					.setColor("DarkButNotBlack")
					.setTitle(`Active player session #${index + 1}`)
					.addFields(
						{ name: "🏠 Guild", value: formatGuildMention(session.guild) },
						{
							name: "🔊 Channel",
							value: channel ? formatChannelMention(channel) : "Unknown channel",
						},
						{
							name: "👤 User",
							value: session.user ? formatUserMention(session.user) : "Unknown user",
						},
						{ name: "📚 Queue size", value: String(session.queueSize), inline: true },
						{ name: "🎵 Now playing", value: session.nowPlaying ?? "Nothing", inline: true },
						{
							name: "Player state",
							value: session.playerState === "Paused" ? "⏸️ Paused" : "▶️ Playing",
							inline: true,
						},
						{
							name: "👥 Member count",
							value: channel ? String(channel.members.size) : "Unknown",
							inline: true,
						},
						{ name: "🪪 Session ID", value: voiceState?.sessionId ?? "Unknown", inline: true },
						{
							name: "Server deaf",
							value: voiceState?.serverDeaf ? "🔇 Active" : "🔊 Not active",
							inline: true,
						},
						{
							name: "Server mute",
							value: voiceState?.serverMute ? "🔇 Muted" : "🎙️ Not muted",
							inline: true,
						},
					)
					.setTimestamp();
			});

			await sendResponse({
				destination: interaction,
				content: {
					content: `Found ${sessions.length} guild${sessions.length === 1 ? "" : "s"} with active player session${sessions.length === 1 ? "" : "s"}.`,
					embeds,
					flags: MessageFlags.Ephemeral,
				},
			});
			return;
		}

		if (subcommand === "refresh-player-health") {
			logger.info("PLAYER", "Starting player health check via manual invocation", {
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
			});
			const playerHealthy = await runPlayerHealthCheck();
			const healthEmbed = new EmbedBuilder()
				.setColor(playerHealthy ? "Green" : "Red")
				.setAuthor({
					name: `${config.BOT_NAME} : Player Health`,
					iconURL: config.BOT_PFP,
					url: config.BOT_WEBSITE,
				})
				.setTitle("Player Health Refresh")
				.setDescription(playerHealthy ? "💚 Player is available." : "💔 Player is unavailable.")
				.setTimestamp();
			await interaction.editReply({ embeds: [healthEmbed] });
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
