const {
	PermissionFlagsBits,
	SlashCommandBuilder,
	EmbedBuilder,
	GuildMember,
	ChatInputCommandInteraction,
} = require("discord.js");
const config = require("../../config.json");
const WarnHandler = require("../../Components/WarnHandler");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");

class warn {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new warn(client);
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
		this.#name = "warn";
		this.#desc = "Issue a warning for a user";
		this.#helpDesc =
			"Keep track of user's by issuing warnings for them. Automatically timeout/ban them once a certain threshold is reached. (Ban/Timeout are Optional)\n</warn setup:__id__> : Set the threshold for timeout and ban to take effect. Takes in threshold for timeout and ban (Set to `-1` to deactivate), along with the timeout duration and the audit channel for issued warnings.\n</warn issue:__id__> : Issue a warning for a particular user. (Reason Optional)\n</warn check:__id__> : Get the current warn setup for the guild. (User Optional : Pass a user to get their current warning count)\n</warn override:__id__> : Override the warning count for a particular user.";
		this.#cType = "mod";
		this.#id = "1083507846806777995";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("setup")
					.setDescription("Setup thresholds for timeout and ban")
					.addNumberOption((option) =>
						option
							.setName("timeout")
							.setDescription("Warn threshold for Timeout (-1 to disable)")
							.setMinValue(-1)
							.setRequired(true),
					)
					.addNumberOption((option) =>
						option
							.setName("timeoutduration")
							.setDescription("Duration for the timeout")
							.setChoices(
								{ name: "1 Hour", value: 1 },
								{ name: "12 Hour", value: 12 },
								{ name: "1 Day", value: 24 },
								{ name: "1 Week", value: 168 },
							)
							.setRequired(true),
					)
					.addNumberOption((option) =>
						option
							.setName("ban")
							.setDescription("Warn threshold for Ban (-1 to disable)")
							.setMinValue(-1)
							.setRequired(true),
					)
					.addChannelOption((option) =>
						option.setName("channel").setDescription("Audit Channel for warning(s)").setRequired(true),
					),
			)
			.addSubcommand((group) =>
				group
					.setName("issue")
					.setDescription("Issue a warning to a user")
					.addUserOption((option) =>
						option.setName("user").setDescription("User to trigger the warning").setRequired(true),
					)
					.addStringOption((option) =>
						option.setName("reason").setDescription("Reason for the warning").setRequired(false),
					),
			)
			.addSubcommand((group) =>
				group
					.setName("check")
					.setDescription("Check the current threshold settings / warning count for a user")
					.addUserOption((option) =>
						option.setName("user").setDescription("User to check the warning count").setRequired(false),
					),
			)
			.addSubcommand((group) =>
				group
					.setName("override")
					.setDescription("Override the warning count for a user")
					.addUserOption((option) =>
						option.setName("user").setDescription("User to set the warning count").setRequired(true),
					)
					.addNumberOption((option) =>
						option.setName("count").setDescription("New warn count for the user").setMinValue(0).setRequired(true),
					),
			)
			.setDMPermission(false)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.toJSON();
	}

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		let type = interaction.options.getSubcommand();
		if (type == "setup") {
			await WarnHandler.setupWarn(interaction);
			await WarnHandler.checkWarn(interaction);
		} else if (type == "issue") {
			await WarnHandler.issueWarn(interaction);
		} else if (type == "check") {
			await WarnHandler.checkWarn(interaction);
		} else if (type == "override") {
			await WarnHandler.overrideUser(interaction);
			await WarnHandler.checkWarn(interaction);
		}
	}
}

module.exports = warn;
