const { PermissionFlagsBits, ChannelType, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const config = require("../../config.json");
const AnnounceHandler = require("../../Components/AnnounceHandler");
const ClientHandler = require("../../Components/ClientHandler");

class memberannounce {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new memberannounce(client);
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
		this.#name = "memberannounce";
		this.#desc = "Control the member i-o announcement feature for this server";
		this.#helpDesc =
			"Announcement feature when a user joins / leaves a server\n</memberannounce check:__id__> : Check the status of the member announcement system\n</memberannounce off:__id__> : Turn off the member announcement system\n</memberannounce on:__id__> : Turn on the member announcement system. Takes in a text channel as input.";
		this.#cType = "mod";
		this.#id = "1083507846433480706";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("on")
					.setDescription("Turn on the member announcement system")
					.addChannelOption((option) =>
						option
							.setName("channel")
							.setDescription("Channel")
							.addChannelTypes(ChannelType.GuildText)
							.setRequired(true),
					),
			)
			.addSubcommand((group) => group.setName("off").setDescription("Turn off the member announcement system"))
			.addSubcommand((group) =>
				group.setName("check").setDescription("Check the status of the member announcement system"),
			)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		if (interaction.options.getSubcommand() === "on") {
			AnnounceHandler.announceOn(interaction);
		} else if (interaction.options.getSubcommand() === "off") {
			await AnnounceHandler.announceOff(interaction.guildId);
			await AnnounceHandler.checkMemberAnnouncementStatus(interaction);
		} else {
			await AnnounceHandler.checkMemberAnnouncementStatus(interaction);
		}
	}
}
module.exports = memberannounce;
