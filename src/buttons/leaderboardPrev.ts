import { MessageFlags } from "discord.js";

import type { ButtonModule } from "../services/buttonLoader.js";
import { buildLeaderboardReply } from "../commands/leaderboard.js";

const button: ButtonModule = {
	buttonData: { id: "leaderboard-prev" },
	execute: async ({ interaction, config }) => {
		const [, userId, rawPage] = interaction.customId.split("|");
		if (userId !== interaction.user.id) {
			await interaction.reply({
				content: ":error: Only the user who opened this leaderboard can use these buttons.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (!interaction.guild) {
			await interaction.reply({
				content: ":error: This leaderboard is no longer available.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await interaction.update(
			await buildLeaderboardReply({
				guildId: interaction.guild.id,
				guildName: interaction.guild.name,
				userId,
				config,
				page: Number(rawPage) - 1,
			}),
		);
	},
};

export default button;
