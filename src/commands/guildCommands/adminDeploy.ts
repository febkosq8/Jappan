import {
	EmbedBuilder,
	ApplicationCommandOptionType,
	chatInputApplicationCommandMention,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { ApplicationCommand, Guild } from "discord.js";

import {
	formatCommandDisplayEntry,
	getCommandDisplayEntries,
	type BotCommand,
	type BotCommandData,
} from "../../helpers/command.js";
import { formatGuild, formatGuildMention } from "../../helpers/discord.js";
import { sendResponse } from "../../helpers/response.js";
import { undeployGuildCommandsGlobally } from "../../services/adminDeployment.js";
import { getCommands } from "../../services/commandLoader.js";
import type { Config } from "../../services/config.js";
import { isAdminUser } from "../../services/adminGuild.js";
import { logger } from "../../services/logger.js";

const commandData = {
	name: "admin-deploy",
	description: "Inspect the bot's registered application commands",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	hasSubCommands: true,
	subCommands: [
		{ name: "check-deploy", description: "Show the commands currently registered with Discord", category: "admin" },
		{ name: "undeploy-guilds", description: "Remove guild commands from every installed guild", category: "admin" },
	],
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
	],
} satisfies BotCommandData;

function formatCommandEntries(command: ApplicationCommand, commandNumber: number): string[] {
	const loadedCommand = getCommands().get(command.name);
	if (loadedCommand) {
		return getCommandDisplayEntries(loadedCommand, command.id).map((entry) =>
			formatCommandDisplayEntry({ entry, indent: "", number: String(commandNumber) }),
		);
	}

	const subcommands = command.options.flatMap((option) => {
		if (option.type === ApplicationCommandOptionType.Subcommand) {
			return [
				{
					mention: chatInputApplicationCommandMention(command.name, option.name, command.id),
					description: option.description,
				},
			];
		}
		if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
			return (option.options ?? [])
				.filter((subcommand) => subcommand.type === ApplicationCommandOptionType.Subcommand)
				.map((subcommand) => ({
					mention: chatInputApplicationCommandMention(command.name, option.name, subcommand.name, command.id),
					description: subcommand.description,
				}));
		}
		return [];
	});

	if (subcommands.length === 0) {
		return [
			`${chatInputApplicationCommandMention(command.name, command.id)} (\`${command.id}\`)\n${
				command.description || "No description"
			}`,
		];
	}

	return subcommands.map(
		({ mention, description }) => `${mention} (\`${command.id}\`)\n${description || "No description"}`,
	);
}

function getCommandEntries(commands: ReadonlyMap<string, ApplicationCommand>): string[] {
	const entries = [...commands.values()]
		.sort((left, right) => left.name.localeCompare(right.name))
		.flatMap((command, index) => formatCommandEntries(command, index + 1));
	return entries.length > 0 ? entries : ["None"];
}

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

function createCommandEmbeds({
	config,
	globalCommands,
	guildCommands,
}: {
	config: Config;
	globalCommands: ReadonlyMap<string, ApplicationCommand>;
	guildCommands: ReadonlyMap<string, ApplicationCommand>;
}): EmbedBuilder[] {
	const globalEntries = getCommandEntries(globalCommands);
	const guildEntries = getCommandEntries(guildCommands);
	const sections = [
		{
			name: `Global commands (${globalCommands.size}) / subcommands (${globalEntries.length})`,
			entries: globalEntries,
		},
		{
			name: `Guild commands (${guildCommands.size}) / subcommands (${guildEntries.length})`,
			entries: guildEntries,
		},
	];
	const summary = `Discord currently has **${globalCommands.size} global** and **${guildCommands.size} guild** commands registered.`;
	const pageDescriptions: string[] = [];
	let currentPage = summary;
	const maxDescriptionLength = 4096;

	for (const section of sections) {
		let sectionStarted = false;
		for (const entry of section.entries) {
			const addition = sectionStarted ? `\n\n${entry}` : `\n\n**${section.name}**\n${entry}`;
			if (currentPage.length + addition.length > maxDescriptionLength && currentPage !== summary) {
				pageDescriptions.push(currentPage);
				currentPage = `**${section.name}**\n${entry}`;
				sectionStarted = true;
				continue;
			}
			currentPage += addition;
			sectionStarted = true;
		}
	}
	pageDescriptions.push(currentPage);
	const pageCount = pageDescriptions.length;

	return Array.from({ length: pageCount }, (_, pageIndex) =>
		new EmbedBuilder()
			.setColor("Orange")
			.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setTitle("Registered application commands")
			.setDescription(pageDescriptions[pageIndex] ?? summary)
			.setFooter({ text: `Page ${pageIndex + 1} / ${pageCount}` })
			.setTimestamp(),
	);
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand.setName("check-deploy").setDescription("Show the commands currently registered with Discord"),
		)
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

		if (!isAdminUser(interaction.user.id, config)) {
			logger.warn("ADMIN", "Unauthorized deployment status attempt", {
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
				const { undeployedGuilds, failedGuilds } = await undeployGuildCommandsGlobally(interaction.client);
				const embed = new EmbedBuilder()
					.setColor(failedGuilds.length > 0 ? "Red" : "Green")
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle("Guild command undeployment results")
					.setDescription(
						`Removed guild commands from ${undeployedGuilds.length} guild${undeployedGuilds.length === 1 ? "" : "s"}.`,
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
		if (subcommand === "check-deploy") {
			try {
				const globalCommands = await interaction.client.application.commands.fetch();
				const guildCommands = await interaction.guild.commands.fetch();
				const embeds = createCommandEmbeds({ config, globalCommands, guildCommands });
				await sendResponse({
					destination: interaction,
					content: { embeds, flags: MessageFlags.Ephemeral },
				});
				logger.info("ADMIN", "Deployment status inspected", {
					user: `${interaction.user.tag} <${interaction.user.id}>`,
					guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
					globalCommandCount: globalCommands.size,
					guildCommandCount: guildCommands.size,
				});
			} catch (error: unknown) {
				logger.error("ADMIN", "Deployment status inspection failed", {
					user: `${interaction.user.tag} <${interaction.user.id}>`,
					guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
					error,
				});
				await interaction.editReply("⛔ Failed to retrieve the registered commands.");
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
