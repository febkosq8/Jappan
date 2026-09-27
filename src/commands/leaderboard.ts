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

interface CreateLeaderboardComponentsOptions {
	userId: string;
	page: number;
	pageCount: number;
}

export function createLeaderboardComponents({
	userId,
	page,
	pageCount,
}: CreateLeaderboardComponentsOptions): ActionRowBuilder<ButtonBuilder> | undefined {
	const buttons = new ActionRowBuilder<ButtonBuilder>();
	if (page > 1) {
		buttons.addComponents(
			new ButtonBuilder()
				.setCustomId(`LeaderboardPrev|UID#${userId}:PAGE#${page}`)
				.setLabel("Previous")
				.setStyle(ButtonStyle.Primary),
		);
	}
	if (page < pageCount) {
		buttons.addComponents(
			new ButtonBuilder()
				.setCustomId(`LeaderboardNext|UID#${userId}:PAGE#${page}`)
				.setLabel("Next")
				.setStyle(ButtonStyle.Primary),
		);
	}
	return buttons.components.length > 0 ? buttons : undefined;
}

interface BuildLeaderboardReplyOptions {
	guildId: string;
	guildName: string;
	userId: string;
	config: Config;
	page: number;
}

export async function buildLeaderboardReply({
	guildId,
	guildName,
	userId,
	config,
	page,
}: BuildLeaderboardReplyOptions): Promise<{
	embeds: ReturnType<typeof createLeaderboardEmbed>[];
	components: ActionRowBuilder<ButtonBuilder>[];
}> {
	const leaderboard = await getLeaderboard({ guildId, page });
	const buttons = createLeaderboardComponents({ userId, page: leaderboard.page, pageCount: leaderboard.pageCount });
	return {
		embeds: [createLeaderboardEmbed({ guildName, config, leaderboard })],
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
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		const status = await getLevelingStatus(interaction.guild);
		if (!status.leveling.enabled) {
			await interaction.editReply("⛔ The leveling system is currently disabled for this server.");
			return;
		}

		await interaction.editReply(
			await buildLeaderboardReply({
				guildId: interaction.guild.id,
				guildName: interaction.guild.name,
				userId: interaction.user.id,
				config,
				page: 1,
			}),
		);
	},
};

export default command;
