const config = require("../../config.json");
const GlobalCommands = require("../../Components/GlobalCommands");
const { EmbedBuilder } = require("discord.js");
let musicFiles = "";
class MusicHelp {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new MusicHelp(client);
		}
		return this.instance;
	}
	constructor(client) {
		musicFiles = GlobalCommands.getInstance(client).getMusicFiles();
	}
	async execute(interaction) {
		await interaction.deferReply();
		let musicHelpEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Find help regarding " + config.botName + " here")
			.setAuthor({
				name: config.botName + " : Docs",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription("Music Commands")
			.addFields(
				...musicFiles.map((file) => {
					return {
						name: `</${file.name}:${file.id}>`,
						value: file.helpDesc.replaceAll("__id__", file.id),
					};
				}),
			);
		interaction.editReply({ embeds: [musicHelpEmbed] });
	}
}
module.exports = MusicHelp;
