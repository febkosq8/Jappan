const { PermissionFlagsBits, ChannelType, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
//GuildLevel
const AuditHandler = require("../../Components/AuditHandler");
const ClientHandler = require("../../Components/ClientHandler");

class auditlog {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new auditlog(client);
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
		this.#name = "auditlog";
		this.#desc = "Control the audit log feature for this server";
		this.#helpDesc =
			"Keeps track of various events in the channel the moderator specifies.\nEvents supported : `Message Deleted/Edited`, `Invite Create/Revoke`\n`Member Join/Leave`, `Role Given/Removed`, `Nickname Change`\n`Member Banned/Unbanned`, `Timeouts`, `Channel Created/Deleted/Updated`\n`Role Created/Deleted/Updated`, `Voice Channel Joined/Left/Changed`\n`User Profile Update`\n</auditlog check:__id__> : Check the current status of the audit log\n</auditlog off:__id__> : Turn off the audit feature\n</auditlog on:__id__> : Turn on the audit feature";
		this.#cType = "mod";
		this.#id = "1040455617111937087";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("on")
					.setDescription("Turn on the audit log system")
					.addChannelOption((option) =>
						option
							.setName("channel")
							.setDescription("Channel to send the audit event log to")
							.addChannelTypes(ChannelType.GuildText)
							.setRequired(true)
					)
			)
			.addSubcommand((group) => group.setName("off").setDescription("Turn off the audit log system"))
			.addSubcommand((group) =>
				group.setName("check").setDescription("Check the status of the audit log system for this server")
			)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		await interaction.deferReply({ ephemeral: true });
		if (interaction.options._subcommand === "on") {
			AuditHandler.auditOn(interaction);
		} else if (interaction.options._subcommand === "off") {
			await AuditHandler.auditOff(interaction.guildId);
			await AuditHandler.checkAuditStatus(interaction);
		} else {
			await AuditHandler.checkAuditStatus(interaction);
		}
	}
}
module.exports = auditlog;
