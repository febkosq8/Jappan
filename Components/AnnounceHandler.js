const guildList = require("../Managers/Schemas/guildListSchema");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const EventHandler = require("../Components/EventHandler");
const ClientHandler = require("../Components/ClientHandler");
const config = require("../config.json");

class AnnounceHandler {
	static async announceOn(interaction) {
		let channel = await interaction.options.getChannel("channel");
		let guild = await interaction.guild;
		let perms = guild.members.me
			.permissionsIn(channel)
			.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
		if (perms) {
			await guildList.findOneAndUpdate(
				{ guildId: interaction.guildId },
				{
					$set: {
						announceActive: true,
						announceChannelId: channel.id,
						announceChannelName: channel.name,
						timeStamp: new Date().toISOString(),
					},
				}
			);
			await this.checkMemberAnnouncementStatus(interaction);
		} else {
			interaction.editReply(`:no_entry: We dont have enough permissions to post in that channel`);
		}
		channel.send({
			content: "`Member I-O` event's will be sent to this channel from now on :cowboy:",
		});
	}
	static async announceOff(guildId) {
		await guildList.findOneAndUpdate(
			{ guildId: guildId },
			{
				$set: {
					announceActive: false,
					announceChannelId: "",
					announceChannelName: "",
					timeStamp: new Date().toISOString(),
				},
			}
		);
	}
	static async checkMemberAnnouncementStatus(interaction) {
		let rawGuildData = await guildList.findOne({
			guildId: interaction.guildId,
		});
		let memberAnnounceEmbed = new EmbedBuilder()
			.setColor("Blurple")
			.setTitle("Guild Name : " + rawGuildData.guildName)
			.setAuthor({
				name: config.botName + " : Member Announcement Status",
				iconURL: config.botpfp,
				url: config.botWebsite,
			});
		if (rawGuildData?.announceActive) {
			let channel = await ClientHandler.getClientChannel(rawGuildData?.announceChannelId);
			memberAnnounceEmbed.addFields(
				{
					name: "Member Announcement Feature",
					value: `:green_circle: **ON**`,
				},
				{ name: "Announcement Channel", value: `${channel}` }
			);
		} else {
			memberAnnounceEmbed.addFields({
				name: "Member Announcement  Feature",
				value: `:red_circle: **OFF**`,
			});
		}

		await interaction.editReply({
			embeds: [memberAnnounceEmbed],
		});
	}
	static async checkAnnounceGuild(member, type) {
		try {
			let rawGuildData = await guildList.findOne({
				guildId: member.guild.id,
			});
			if (rawGuildData?.announceActive) {
				try {
					let avatar = member.user.displayAvatarURL();
					let announceEmbed = new EmbedBuilder()
						.setColor(type === "guildMemberAdd" ? "Aqua" : "DarkRed")
						.setAuthor({
							name: member.user.username + "#" + member.user.discriminator,
							iconURL: avatar,
						})
						.setTimestamp()
						.setDescription(
							`${member.user}` +
								" just " +
								(type === "guildMemberAdd" ? "joined :tada: " : "left :melting_face: ") +
								`**${member.guild.name}**`
						);
					let announceChannel = await ClientHandler.getClientChannel(rawGuildData?.announceChannelId);
					if (announceChannel) {
						announceChannel.send({ embeds: [announceEmbed] });
					} else {
						let postChannel = await ClientHandler.getClientGuildPostChannel(member.guild.id, ["general"]);
						if (postChannel) {
							postChannel.send({
								content:
									":warning: The channel `#" +
									rawGuildData?.announceChannelName +
									"` setup for announcing member change is no longer accessable by the bot and hence the feature was turned off for this server.\nPlease re-enable the member announce feature to continue getting announcements.",
							});
						}
						this.announceOff(member.guild.id);
					}
				} catch (error) {
					EventHandler.auditEvent(
						"ERROR",
						"Failed to send member status update for Guild ID : " + member.guild.id + " with Error : " + error,
						error
					);
				}
			}
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute checkAnnounceGuild with Error : " + error, error);
		}
	}
}

module.exports = AnnounceHandler;
