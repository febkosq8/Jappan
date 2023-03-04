const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
//GuildLevel
const LevelHandler = require("../../Components/LevelHandler");
const ClientHandler = require("../../Components/ClientHandler");

class level {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new level(client);
		}
		return this.instance;
	}
	constructor(client) {
		this.processCommand(client);
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
		this.#name = "level";
		this.#desc = "Control the leveling feature for this server";
		this.#helpDesc =
			"Awards users with points for activity through messages, interactions or voice channels. Awards user with a role once they hit the specified threshold (Optional)\n</level check:__id__> : Check the status of the leveling system\n</level off:__id__> : Turn off the leveling system\n</level on:__id__> : Turn on the leveling system (Threshold & Role Optional)";
		this.#cType = "mod";
		this.#id = "1037274552998309970";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("on")
					.setDescription("Turn on the leveling system")
					.addStringOption((option) =>
						option
							.setName("threshold")
							.setDescription("Threshold for characters to trigger a role add (Optional)")
							.setRequired(false)
					)
					.addRoleOption((option) =>
						option
							.setName("role")
							.setDescription("Role to assign once a user reaches the threshold (Optional)")
							.setRequired(false)
					)
			)
			.addSubcommand((group) => group.setName("off").setDescription("Turn off the leveling system"))
			.addSubcommand((group) => group.setName("check").setDescription("Check the status of the leveling system"))
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		await interaction.deferReply({ ephemeral: true });
		if (interaction.options._subcommand === "on") {
			let status = await LevelHandler.levelOn(interaction);
			if (status === 2) {
				await LevelHandler.checkLevelStatus(interaction);
			} else if (status === 1) {
				interaction.editReply(
					`:bangbang: We cant turn on the Leveling system as you did not provide both threshold and role.`
				);
			} else if (status === 0) {
				interaction.editReply(
					`:bangbang: Could not turn on the Leveling system, as the given role has more hierarchy than me`
				);
			}
		} else if (interaction.options._subcommand === "off") {
			await LevelHandler.levelOff(interaction.guildId);
			await LevelHandler.checkLevelStatus(interaction);
		} else {
			await LevelHandler.checkLevelStatus(interaction);
		}
	}
}
module.exports = level;
