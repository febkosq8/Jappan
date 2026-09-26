import { MessageFlags } from "discord.js";

import type { ButtonModule } from "../services/buttonLoader.js";
import { buildLeaderboardReply } from "../commands/leaderboard.js";

const button: ButtonModule = {
	buttonData: { id: "leaderboard-next" },
	execute: async ({ interaction, config }) => {
		const [, userId, rawPage] = interaction.customId.split("|");
		if (userId !== interaction.user.id) {
			await interaction.reply({
				content: "Only the user who opened this leaderboard can use these buttons.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (!interaction.guild) {
			await interaction.reply({ content: "This leaderboard is no longer available.", flags: MessageFlags.Ephemeral });
			return;
		}
		await interaction.update(
			await buildLeaderboardReply(interaction.guild.id, interaction.guild.name, userId, config, Number(rawPage) + 1),
		);
	},
};

export default button;
