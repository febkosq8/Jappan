const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
var pjson = require("../../package.json");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");

class about {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new about(client);
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
		this.#name = "about";
		this.#desc = "Get to know more about this bot";
		this.#helpDesc = "Get to know more about this bot";
		this.#cType = "general";
		this.#id = "1083507845984682075";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		const butttonLabelList = [
			{ key: "Ping", value: "Ping Stats" },
			{ key: "Help", value: "Help Docs" },
		];
		let buttonRow = new ActionRowBuilder();
		for (let i = 0; i < butttonLabelList.length; i++) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(butttonLabelList[i].key)
					.setLabel(butttonLabelList[i].value)
					.setStyle(ButtonStyle.Primary),
			);
		}
		buttonRow.addComponents(
			new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Status Updates").setURL("https://discord.gg/3mRbVCjvmz"),
			new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Website").setURL("https://www.febkosq8.me/Jappan"),
		);
		const uptime = await ClientHandler.getClientUptime();
		const owner = await ClientHandler.getClientUser("407819516513484801");
		const mongoStatus = await ClientHandler.getMongoStatus();
		const aboutEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Find help regarding " + config.botName + " here")
			.setAuthor({
				name: config.botName + " : About",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription(config.about)
			.addFields(
				{
					name: "Features :",
					value: "Music Playback, Fun Commands, Leveling System, Moderation Tools",
				},
				{
					name: "Bot Version :",
					value: "v" + pjson.version,
				},
				{
					name: "Status :",
					value:
						"Server active since " +
						`<t:${uptime}:R>\n` +
						"Database : " +
						(mongoStatus ? "`Connected`" : "`Disconnected`"),
				},
				{
					name: "Creator :",
					value: `${owner}`,
				},
				{
					name: "Know More",
					value: "Interact below",
				},
			);
		await interaction.editReply({
			embeds: [aboutEmbed],
			components: [buttonRow],
		});
	}
}
module.exports = about;
