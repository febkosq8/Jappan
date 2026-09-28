import {
	EmbedBuilder,
	ApplicationCommandOptionType,
	chatInputApplicationCommandMention,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { ApplicationCommand } from "discord.js";

import {
	formatCommandDisplayEntry,
	getCommandDisplayEntries,
	type BotCommand,
	type BotCommandData,
} from "../../helpers/command.js";
import { sendResponse } from "../../helpers/response.js";
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
			formatCommandDisplayEntry(entry, "", String(commandNumber)),
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
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
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
			const embeds = createCommandEmbeds({ config, globalCommands, guildCommands });
			await sendResponse(interaction, { embeds, flags: MessageFlags.Ephemeral });
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
