import { MessageFlags } from "discord.js";

import type { ButtonModule } from "../services/buttonLoader.js";
import { buildLeaderboardReply } from "../commands/leaderboard.js";
import { parseButtonCustomId } from "../helpers/button.js";

const button: ButtonModule = {
	buttonData: { id: "LeaderboardNext" },
	execute: async ({ interaction, config }) => {
		const fields = parseButtonCustomId(interaction.customId);
		const userId = fields.get("UID");
		const page = Number(fields.get("PAGE"));
		if (userId !== interaction.user.id) {
			await interaction.reply({
				content: "⛔ Only the user who opened this leaderboard can use these buttons.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (!interaction.guild) {
			await interaction.reply({
				content: "⛔ This leaderboard is no longer available.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (!Number.isInteger(page) || page < 1) {
			await interaction.reply({
				content: "⛔ This leaderboard button is invalid or expired.",
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
				page: page + 1,
			}),
		);
	},
};

export default button;
