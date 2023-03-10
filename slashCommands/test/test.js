const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { QueryType } = require("discord-player");
const { useMasterPlayer } = require("discord-player");
const mongoose = require("mongoose");
const LevelHandler = require("../../Components/LevelHandler");
const ClientHandler = require("../../Components/ClientHandler");
const AuditHandler = require("../../Components/AuditHandler");
const DatabaseManager = require("../../Managers/DatabaseManager");
const guildListSchema = require("../../Managers/Schemas/guildListSchema");
const fs = require("node:fs");

class test {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new test(client);
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
		this.#name = "test";
		this.#desc = "test command";
		this.#helpDesc = "test command";
		this.#cType = "test";
		this.#id = "-1";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		await guildListSchema.updateMany(
			{},
			{
				$unset: { warnAuditChannelID: "" },
			}
		);
		await interaction.editReply("ok done");
	}
}
module.exports = test;
