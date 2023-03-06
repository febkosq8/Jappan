const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { QueryType } = require("discord-player");
const { useMasterPlayer } = require("discord-player");
const mongoose = require("mongoose");
const LevelHandler = require("../../Components/LevelHandler");
const ClientHandler = require("../../Components/ClientHandler");
const AuditHandler = require("../../Components/AuditHandler");
const DatabaseManager = require("../../Managers/DatabaseManager");
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
		const player = useMasterPlayer();
		let filePath = `${__dirname}/../../assets/Music/dieForYou.mp3`;
		await interaction.deferReply();
		await player.play(interaction.member.voice.channel, filePath, {
			searchEngine: QueryType.FILE,
			nodeOptions: {
				metadata: interaction.channel,
				bufferingTimeout: 15000,
				leaveOnStop: true,
				leaveOnStopCooldown: 5000,
				leaveOnEnd: true,
				leaveOnEndCooldown: 15000,
				leaveOnEmpty: true,
				leaveOnEmptyCooldown: 300000,
				skipOnNoStream: true,
			},
		});
		interaction.editReply("Playing");
	}
}
module.exports = test;
