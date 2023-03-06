const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClearHandler = require("../../Components/ClearHandler");
const ClientHandler = require("../../Components/ClientHandler");

class clear {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new clear(client);
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
		this.#name = "clear";
		this.#desc = "Clear messages";
		this.#helpDesc =
			"</clear channel:__id__> : Clear messages from a particular channel (User / Count Optional. Cannot delete messages older than 14 days)\n</clear user:__id__> :  Clear messages belonging to a particular user. Will try to delete from every channel type except **FORUM**. (Max Limit per call : 100)";
		this.#cType = "mod";
		this.#id = "1038633862701514754";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("channel")
					.setDescription("Delete messages from this channel (Count & User Optional / Max 100 messages at a time)")
					.addNumberOption((option) =>
						option
							.setName("count")
							.setDescription("Number of messages (Not older than 14 days) to delete (Optional)")
							.setRequired(false)
					)
					.addUserOption((option) =>
						option
							.setName("username")
							.setDescription("Messages of which User to be deleted (Optional)")
							.setRequired(false)
					)
			)
			.addSubcommand((group) =>
				group
					.setName("user")
					.setDescription("Delete messages from this guild")
					.addUserOption((option) =>
						option.setName("username").setDescription("Messages of which User to be deleted").setRequired(true)
					)
			)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		let type = interaction.options._subcommand;
		if (type === "channel") {
			await ClearHandler.clearChannelMessages(interaction);
		} else if (type === "user") {
			await ClearHandler.clearGuildUserMessages(interaction);
		}
	}
}

module.exports = clear;
