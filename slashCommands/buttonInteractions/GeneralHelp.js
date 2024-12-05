const config = require("../../config.json");
const GlobalCommands = require("../../Components/GlobalCommands");
const { EmbedBuilder } = require("discord.js");
let generalFiles = "";
class GeneralHelp {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new GeneralHelp(client);
		}
		return this.instance;
	}
	constructor(client) {
		generalFiles = GlobalCommands.getInstance(client).getGeneralFiles();
	}
	async execute(interaction) {
		await interaction.deferReply();
		let generalHelpEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Find help regarding " + config.botName + " here")
			.setAuthor({
				name: config.botName + " : Docs",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription("General Commands")
			.addFields(
				...generalFiles.map((file) => {
					return {
						name: `</${file.name}:${file.id}>`,
						value: file.helpDesc.replace(/__id__/g, file.id),
					};
				}),
			);
		interaction.editReply({ embeds: [generalHelpEmbed] });
	}
}
module.exports = GeneralHelp;
