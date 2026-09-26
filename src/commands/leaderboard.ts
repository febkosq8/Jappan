import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import type { Config } from "../services/config.js";
import { createLeaderboardEmbed, getLeaderboard, getLevelingStatus } from "../services/leveling.js";

const commandData = {
	name: "leaderboard",
	description: "Show the leaderboard for this server",
	category: "level",
	isDBDependant: true,
} satisfies BotCommandData;

export function createLeaderboardComponents(
	userId: string,
	page: number,
	pageCount: number,
): ActionRowBuilder<ButtonBuilder> | undefined {
	const buttons = new ActionRowBuilder<ButtonBuilder>();
	if (page > 1) {
		buttons.addComponents(
			new ButtonBuilder()
				.setCustomId(`leaderboard-prev|${userId}|${page}`)
				.setLabel("Previous")
				.setStyle(ButtonStyle.Primary),
		);
	}
	if (page < pageCount) {
		buttons.addComponents(
			new ButtonBuilder()
				.setCustomId(`leaderboard-next|${userId}|${page}`)
				.setLabel("Next")
				.setStyle(ButtonStyle.Primary),
		);
	}
	return buttons.components.length > 0 ? buttons : undefined;
}

export async function buildLeaderboardReply(
	guildId: string,
	guildName: string,
	userId: string,
	config: Config,
	page: number,
): Promise<{ embeds: ReturnType<typeof createLeaderboardEmbed>[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
	const leaderboard = await getLeaderboard(guildId, page);
	const buttons = createLeaderboardComponents(userId, leaderboard.page, leaderboard.pageCount);
	return {
		embeds: [createLeaderboardEmbed(guildName, config, leaderboard)],
		components: buttons ? [buttons] : [],
	};
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("This command can only be used in a guild.");
			return;
		}

		const status = await getLevelingStatus(interaction.guild.id, interaction.guild.name);
		if (!status.leveling.enabled) {
			await interaction.editReply("The leveling system is currently disabled for this server.");
			return;
		}

		await interaction.editReply(
			await buildLeaderboardReply(interaction.guild.id, interaction.guild.name, interaction.user.id, config, 1),
		);
	},
};

export default command;
