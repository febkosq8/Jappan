const config = require("../../config.json");
const GlobalCommands = require("../../Components/GlobalCommands");
const { EmbedBuilder } = require("discord.js");
let funFiles = "";
class FunHelp {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new FunHelp(client);
		}
		return this.instance;
	}
	constructor(client) {
		funFiles = GlobalCommands.getInstance(client).getFunFiles();
	}
	async execute(interaction) {
		await interaction.deferReply();
		let funHelpEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Find help regarding " + config.botName + " here")
			.setAuthor({
				name: config.botName + " : Docs",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription("Fun Commands")
			.addFields(
				...funFiles.map((file) => {
					return {
						name: `</${file.name}:${file.id}>`,
						value: file.helpDesc.replaceAll("__id__", file.id),
					};
				}),
			);
		interaction.editReply({ embeds: [funHelpEmbed] });
	}
}
module.exports = FunHelp;
