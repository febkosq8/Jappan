const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { QueryType } = require("discord-player");
const {
	useMasterPlayer,
	useMetadata,
	onBeforeCreateStream,
	onAfterCreateStream,
	useTimeline,
} = require("discord-player");
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
		// const [getMetadata, setMetadata] = useMetadata(interaction.guildId);
		// let currentMetadata = getMetadata();
		const obj2 = useMetadata(interaction.guildId);
		// console.log(obj2);
		// setMetadata(interaction.channel);
		// currentMetadata = getMetadata();
		const { timestamp, volume, paused, pause, resume, setVolume, setPosition } = useTimeline(interaction.guildId);

		interaction.followUp(
			`Current progress : (${timestamp.current.label} / ${timestamp.total.label}) : ${timestamp.progress}%`
		);
		interaction.followUp(`Current volume : ${volume}`);
		interaction.followUp(`Player paused : ${paused}`);
		pause();
		resume();
		setVolume(200);
		// await setPosition(184000);
		// await interaction.editReply(timestamp.current.label + " / " + timestamp.total.label);
	}
}
module.exports = test;
