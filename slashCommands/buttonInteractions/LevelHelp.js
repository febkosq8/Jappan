const config = require("../../config.json");
const GlobalCommands = require("../../Components/GlobalCommands");
const { EmbedBuilder } = require("discord.js");
let levelFiles = "";
class LevelHelp {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new LevelHelp(client);
		}
		return this.instance;
	}
	constructor(client) {
		levelFiles = GlobalCommands.getInstance(client).getLevelFiles();
	}
	async execute(interaction) {
		await interaction.deferReply();
		let levelHelpEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Find help regarding " + config.botName + " here")
			.setAuthor({
				name: config.botName + " : Docs",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription("Level Commands")
			.addFields(
				...levelFiles.map((file) => {
					return {
						name: `</${file.name}:${file.id}>`,
						value: file.helpDesc.replaceAll("__id__", file.id),
					};
				}),
			);
		interaction.editReply({ embeds: [levelHelpEmbed] });
	}
}
module.exports = LevelHelp;
