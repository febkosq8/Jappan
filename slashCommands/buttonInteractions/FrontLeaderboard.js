const LevelHandler = require("../../Components/LevelHandler");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

class FrontLeaderboard {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new FrontLeaderboard(client);
		}
		return this.instance;
	}
	async execute(interaction) {
		const index = interaction.customId.indexOf("|");
		const triggerUser = interaction.customId.substring(index + 1);
		if (triggerUser !== interaction.user.id) {
			interaction.reply({
				content: ":no_entry: Only the user who called leaderboard can use this button",
				ephemeral: true,
			});
		} else {
			let currPage = parseInt(interaction.message.embeds[0].data.footer.text.match(/\d+/g)[0]);
			let levelEmbed = await LevelHandler.getLeaderboardEmbed(interaction, currPage + 1);
			let pageCount = parseInt(levelEmbed.data.footer.text.match(/\d+/g)[1]);
			var butttonLabelList;
			if (currPage + 1 === pageCount) {
				butttonLabelList = [
					{
						key: "BackLeaderboard|" + interaction.user.id,
						value: "◀️ Previous Page",
					},
				];
			} else {
				butttonLabelList = [
					{
						key: "BackLeaderboard|" + interaction.user.id,
						value: "◀️ Previous Page",
					},
					{
						key: "FrontLeaderboard|" + interaction.user.id,
						value: "Next Page ▶️",
					},
				];
			}

			let buttonRow = new ActionRowBuilder();
			for (let i = 0; i < butttonLabelList.length; i++) {
				buttonRow.addComponents(
					new ButtonBuilder()
						.setCustomId(butttonLabelList[i].key)
						.setLabel(butttonLabelList[i].value)
						.setStyle(ButtonStyle.Primary)
				);
			}
			interaction.update({
				embeds: [levelEmbed],
				components: [buttonRow],
			});
		}
	}
}
module.exports = FrontLeaderboard;
