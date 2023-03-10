const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");

class help {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new help(client);
		}
		return this.instance;
	}
	constructor() {
		this.processCommand();
	}

	getCommand() {
		return this.#command;
	}
	getDetails() {
		return {
			name: this.#name,
			helpDesc: this.#helpDesc,
			cType: this.#cType,
			id: ClientHandler.getCommandId(this.#name) || this.#id,
		};
	}
	processCommand() {
		this.#name = "help";
		this.#desc = "List all available commands";
		this.#helpDesc = "List all available commands";
		this.#cType = "general";
		this.#id = "1083507845984682079";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		const butttonLabelList = [
			{ key: "GeneralHelp", value: "General Commands" },
			{ key: "MusicHelp", value: "Music Commands" },
			{ key: "LevelHelp", value: "Level Commands" },
			{ key: "FunHelp", value: "Fun Commands" },
			{ key: "ModHelp", value: "Moderator Commands" },
		];

		let buttonRow = new ActionRowBuilder();
		for (let i = 0; i < butttonLabelList.length; i++) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(butttonLabelList[i].key)
					.setLabel(butttonLabelList[i].value)
					.setStyle(ButtonStyle.Primary)
			);
		}

		const helpEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Find help regarding " + config.botName + " here")
			.setAuthor({
				name: config.botName + " : Docs",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription("Select topic below to proceed");

		return void interaction.editReply({
			embeds: [helpEmbed],
			components: [buttonRow],
		});
	}
}
module.exports = help;
