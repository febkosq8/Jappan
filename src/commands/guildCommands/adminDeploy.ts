import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { Guild } from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { formatGuild, formatGuildMention } from "../../helpers/discord.js";
import { DISCORD_INTERACTION_TIME_LIMIT_MS } from "../../helpers/interaction.js";
import { undeployGuildCommandsGlobally } from "../../services/adminDeployment.js";
import { isAdminUser } from "../../services/adminGuild.js";
import { logger } from "../../services/logger.js";

const commandData = {
	name: "admin-deploy",
	description: "Manage the bot's guild command deployments",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	hasSubCommands: true,
	subCommands: [
		{ name: "undeploy-guilds", description: "Remove guild commands from every installed guild", category: "admin" },
	],
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
	],
} satisfies BotCommandData;

function formatGuildList(guilds: readonly Guild[]): string {
	if (guilds.length === 0) {
		return "None";
	}

	let value = "";
	for (const [index, guild] of guilds.entries()) {
		const entry = `${index + 1}. ${formatGuildMention(guild)}`;
		const nextValue = value ? `${value}\n${entry}` : entry;
		if (nextValue.length > 1024) {
			const remainingCount = guilds.length - index;
			return `${value}\n... and ${remainingCount} more.`;
		}
		value = nextValue;
	}

	return value;
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("undeploy-guilds")
				.setDescription("Remove guild commands from every installed guild")
				.addBooleanOption((option) =>
					option
						.setName("confirm")
						.setDescription("Confirm removing guild commands from all guilds")
						.setRequired(true),
				),
		)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const deadlineAt = Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS;

		if (!isAdminUser(interaction.user.id, config)) {
			logger.warn("ADMIN", "Unauthorized deployment command attempt", {
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
			});
			await interaction.editReply("⛔ You are not authorized to use this command.");
			return;
		}
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "undeploy-guilds") {
			if (interaction.options.getBoolean("confirm", true) !== true) {
				await interaction.editReply("⛔ Confirmation is required to remove guild commands.");
				return;
			}
			try {
				const { undeployedGuilds, failedGuilds, timeLimitReached } = await undeployGuildCommandsGlobally({
					client: interaction.client,
					deadlineAt,
				});
				const embed = new EmbedBuilder()
					.setColor(timeLimitReached ? "Orange" : failedGuilds.length > 0 ? "Red" : "Green")
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle("Guild command undeployment results")
					.setDescription(
						[
							`Removed guild commands from ${undeployedGuilds.length} guild${undeployedGuilds.length === 1 ? "" : "s"}.`,
							timeLimitReached
								? "Maximum run time reached before all guilds were processed. Run this command again to continue."
								: undefined,
						]
							.filter(Boolean)
							.join("\n"),
					)
					.addFields(
						{ name: `Succeeded (${undeployedGuilds.length})`, value: formatGuildList(undeployedGuilds) },
						{ name: `Failed (${failedGuilds.length})`, value: formatGuildList(failedGuilds) },
					)
					.setTimestamp();
				await interaction.editReply({ embeds: [embed] });
				logger.info("ADMIN", "Guild commands undeployed globally", {
					user: `${interaction.user.tag} <${interaction.user.id}>`,
					guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
					undeployedGuildCount: undeployedGuilds.length,
					failedGuildCount: failedGuilds.length,
				});
			} catch (error: unknown) {
				logger.error("ADMIN", "Global guild command undeployment failed", {
					user: `${interaction.user.tag} <${interaction.user.id}>`,
					guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
					error,
				});
				await interaction.editReply("⛔ Failed to remove the guild commands.");
			}
			return;
		}
		logger.error("ADMIN", "Unsupported admin-deploy subcommand", {
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
			subcommand,
		});
		await interaction.editReply("⛔ Unsupported admin-deploy subcommand.");
	},
};

export default command;
