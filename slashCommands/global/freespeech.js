const {
	EmbedBuilder,
	SlashCommandBuilder,
	InteractionContextType,
	ChannelType,
	PermissionFlagsBits,
} = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
const GuildHandler = require("../../Components/GuildHandler");

class freespeech {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new freespeech(client);
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
		this.#name = "freespeech";
		this.#desc = "Make the bot change a voice channel's region if a specific user joins it";
		this.#helpDesc =
			"Set up automation to change the voice channel region based on the user.\nThis is useful for users who have a poor connection to a specific region or want to resolve VOIP issues by changing the region. The free speech automation applies to the first user who joins the channel, according to the free speech rule setup.\n</freespeech add:__id__>: Create a new rule by specifying the user, channel, and region.\n</freespeech check:__id__>: Check the current rules.\n</freespeech delete:__id__>: Delete a rule for a user.";
		this.#cType = "mod";
		this.#id = "1281766378595946649";
		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("add")
					.setDescription("Add a user to watch over")
					.addChannelOption((option) =>
						option
							.setName("channel")
							.setDescription("Which channel to watch")
							.setRequired(true)
							.addChannelTypes(ChannelType.GuildVoice),
					)
					.addUserOption((option) => option.setName("user").setDescription("Which user to watch").setRequired(true))
					.addStringOption((option) =>
						option
							.setName("region")
							.setDescription("Which region to change to")
							.setRequired(true)
							.setAutocomplete(true),
					),
			)
			.addSubcommand((group) => group.setName("check").setDescription("Get a list of users currently being watched"))
			.addSubcommand((group) =>
				group
					.setName("delete")
					.setDescription("Delete the user from the watch list")
					.addUserOption((option) => option.setName("user").setDescription("Which user to watch").setRequired(true)),
			)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async autocomplete(interaction) {
		try {
			const regions = await ClientHandler.getClientVoiceRegions(true);
			await interaction.respond(
				regions.map((region) => ({
					name: region.name,
					value: region.id,
				})),
			);
		} catch (error) {}
	}
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const type = interaction.options.getSubcommand();
		const currentGuildData = await GuildHandler.getGuildPreferences(interaction.guildId);
		if (type === "add") {
			const regions = await ClientHandler.getClientVoiceRegions();
			const channel = interaction.options.getChannel("channel");
			const user = interaction.options.getUser("user");
			const userIndex = currentGuildData?.regionWatchMembers?.findIndex((member) => member?.user?.id === user.id) ?? -1;
			const region = interaction.options.getString("region");
			if (!regions.includes(region)) {
				return await interaction.editReply(`:x: \`${region}\` is not valid Region!`);
			}
			const canBotEditChannel = interaction.guild.members.me
				.permissionsIn(channel)
				.has(PermissionFlagsBits.ManageChannels);
			if (!canBotEditChannel) {
				return await interaction.editReply(`:x: I don't have permission to modify ${channel} !`);
			}
			if (userIndex >= 0) {
				await GuildHandler.updateGuildPreferences(interaction.guildId, {
					$set: {
						[`regionWatchMembers.${userIndex}.channel`]: { id: channel.id, name: channel.name },
						[`regionWatchMembers.${userIndex}.region`]: region,
					},
				});
			} else {
				await GuildHandler.updateGuildPreferences(interaction.guildId, {
					$push: {
						regionWatchMembers: {
							channel: { id: channel.id, name: channel.name },
							user: { id: user.id, username: user.username },
							region,
						},
					},
				});
			}
			await interaction.editReply(
				`:white_check_mark: ${user} is now being watched in ${channel} to change VC region to \`${region}\``,
			);
		} else if (type === "delete") {
			const user = interaction.options.getUser("user");
			const userIndex = currentGuildData?.regionWatchMembers?.findIndex((member) => member?.user?.id === user.id) ?? -1;
			if (userIndex >= 0) {
				await GuildHandler.updateGuildPreferences(interaction.guildId, {
					$unset: {
						[`regionWatchMembers.${userIndex}`]: "",
					},
				});
				await GuildHandler.updateGuildPreferences(interaction.guildId, {
					$pull: { regionWatchMembers: null },
				});
				await interaction.editReply(`:white_check_mark: ${user} is no longer being watched`);
			} else {
				await interaction.editReply(`:x: ${user} was never being watched!`);
			}
		} else if (type === "check") {
			let arrOfMembers = [];
			for (let member of currentGuildData?.regionWatchMembers) {
				const user = await interaction.guild.members.fetch(member.user.id);
				const channel = interaction.guild.channels.cache.get(member.channel.id);
				arrOfMembers.push(
					`${user ?? member.user.username} in being watched in ${channel ?? member.channel.name} to change region to \`${member.region}\``,
				);
			}
			let freeSpeechEmbed = new EmbedBuilder()
				.setColor("DarkGold")
				.setTitle(`Free Speech Monitoring List for ${interaction.guild.name}`)
				.setAuthor({
					name: config.botName,
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTimestamp();
			if (arrOfMembers.length > 0) {
				freeSpeechEmbed.setFields({
					name: `Total ${arrOfMembers.length} users being watched`,
					value: arrOfMembers.join("\n"),
				});
			} else {
				freeSpeechEmbed.setFields({
					name: `No users being watched`,
					value: "Use `/freespeech add` to add a user to watch",
				});
			}
			await interaction.editReply({ embeds: [freeSpeechEmbed] });
		}
	}
}
module.exports = freespeech;
