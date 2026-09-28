import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { isAdminUser } from "../../services/adminGuild.js";
import type { Config } from "../../services/config.js";
import { logger } from "../../services/logger.js";

const commandData = {
	name: "admin-deploy",
	description: "Inspect the bot's registered application commands",
	category: "admin",
	isDBDependant: false,
} satisfies BotCommandData;

function formatCommands(commands: ReadonlyMap<string, { name: string; description: string; id: string }>): string {
	if (commands.size === 0) {
		return "None";
	}

	return [...commands.values()]
		.map((command) => `**/${command.name}** - ${command.description || "No description"} (\`${command.id}\`)`)
		.join("\n")
		.slice(0, 1024);
}

function createCommandEmbed({
	config,
	globalCommands,
	guildCommands,
}: {
	config: Config;
	globalCommands: ReadonlyMap<string, { name: string; description: string; id: string }>;
	guildCommands: ReadonlyMap<string, { name: string; description: string; id: string }>;
}): EmbedBuilder {
	return new EmbedBuilder()
		.setColor("Orange")
		.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle("Registered application commands")
		.addFields(
			{ name: `Global commands (${globalCommands.size})`, value: formatCommands(globalCommands) },
			{ name: `Guild commands (${guildCommands.size})`, value: formatCommands(guildCommands) },
		)
		.setTimestamp();
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand.setName("check-deploy").setDescription("Show the commands currently registered with Discord"),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (!isAdminUser(interaction.user.id, config)) {
			logger.warn("ADMIN", "Unauthorized deployment status attempt", {
				userId: interaction.user.id,
				userName: interaction.user.tag,
				guildId: interaction.guildId,
			});
			await interaction.editReply("⛔ You are not authorized to use this command.");
			return;
		}
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		try {
			const globalCommands = await interaction.client.application.commands.fetch();
			const guildCommands = await interaction.guild.commands.fetch();
			await interaction.editReply({
				embeds: [createCommandEmbed({ config, globalCommands, guildCommands })],
			});
			logger.info("ADMIN", "Deployment status inspected", {
				userId: interaction.user.id,
				userName: interaction.user.tag,
				guildId: interaction.guildId,
				globalCommandCount: globalCommands.size,
				guildCommandCount: guildCommands.size,
			});
		} catch (error: unknown) {
			logger.error("ADMIN", "Deployment status inspection failed", {
				userId: interaction.user.id,
				userName: interaction.user.tag,
				guildId: interaction.guildId,
				error,
			});
			await interaction.editReply("⛔ Failed to retrieve the registered commands.");
		}
	},
};

export default command;
