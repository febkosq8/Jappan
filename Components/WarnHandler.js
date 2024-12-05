const guildListSchema = require("../Managers/Schemas/guildListSchema");
const { EmbedBuilder, ChatInputCommandInteraction, Client } = require("discord.js");
const ClientHandler = require("./ClientHandler");
const config = require("../config.json");

class WarnHandler {
	static async setupWarn(interaction) {
		let timeout = interaction.options.getNumber("timeout");
		let timeoutduration = interaction.options.getNumber("timeoutduration");
		let ban = interaction.options.getNumber("ban");
		let channel = interaction.options.getChannel("channel");
		await guildListSchema.findOneAndUpdate(
			{ guildId: interaction.guild.id },
			{
				$set: {
					guildName: interaction.guild.name,
					warnTimeoutThreshold: timeout,
					warnTimeoutDuration: timeoutduration,
					warnBanThreshold: ban,
					warnAuditChannelId: channel.id,
					warnAuditChannelName: channel.name,
				},
			},
		);
	}

	/**
	 *
	 * @param {ChatInputCommandInteraction} interaction
	 */
	static async issueWarn(interaction) {
		let rawGuildData = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		let newWarnCount = 1;
		let warnUser = interaction.options.getUser("user");
		let reason = interaction.options.getString("reason");
		let targetUser = await ClientHandler.getClientGuildMember(interaction.guildId, warnUser.id);
		if (!targetUser.manageable || !targetUser.moderatable || !targetUser.bannable) {
			interaction.editReply({ content: `:x: Looks like ${targetUser} has a higher role than me.` });
			return;
		}
		let memberList = rawGuildData.memberList;
		let memberExists = memberList.findIndex((member) => member.userid == warnUser.id);
		if (memberExists != -1) {
			//Member Exist
			memberList[memberExists].warnStat ??= 0; //If warnStat is undefined, set it to 0
			memberList[memberExists].warnStat += 1;
			newWarnCount = memberList[memberExists].warnStat;
			memberList[memberExists].username = warnUser.username;
			await guildListSchema.findOneAndUpdate(
				{ guildId: interaction.guild.id },
				{
					$set: {
						guildName: interaction.guild.name,
						memberList: memberList,
					},
				},
			);
		} else {
			//Member Does Not Exist
			let guildUser = {
				userid: warnUser.id,
				username: warnUser.username,
				levelStat: 0,
				warnStat: 1,
			};
			memberList.push(guildUser);
			await guildListSchema.findOneAndUpdate(
				{ guildId: interaction.guild.id },
				{
					$set: {
						guildName: interaction.guild.name,
						memberList: memberList,
					},
				},
			);
		}
		if (rawGuildData.warnAuditChannelId != "") {
			let auditChannel = await ClientHandler.getClientChannel(rawGuildData.warnAuditChannelId);
			if (!auditChannel) {
				let postChannel = await ClientHandler.getClientGuildPostChannel(interaction.guild.id, ["general"]);
				if (postChannel) {
					await guildListSchema.findOneAndUpdate(
						{ guildId: interaction.guild.id },
						{
							$set: {
								warnAuditChannelId: "",
								warnAuditChannelName: "",
							},
						},
					);
					await postChannel.send({
						content:
							":warning: The channel `#" +
							rawGuildData.warnAuditChannelName +
							"` setup for announcing warn events is no longer accessable by the bot and hence the feature was turned off for this server.\nPlease re-setup the warn feature to continue getting audit logs.",
					});
				}
			} else {
				const warnTriggerEmbed = new EmbedBuilder()
					.setColor("DarkButNotBlack")
					.setAuthor({
						name: config.botName,
						iconURL: config.botpfp,
						url: config.botWebsite,
					})
					.setTitle("New Warning issued")
					.setTimestamp()
					.addFields(
						{
							name: "Warning Issued To :",
							value: `${warnUser}`,
						},
						{
							name: "Total Warning(s) :",
							value: `${newWarnCount}`,
						},
						{
							name: "Reason :",
							value: `${reason}`,
						},
						{
							name: "Warning Issued By :",
							value: `${interaction.user}`,
						},
					);
				await auditChannel.send({
					embeds: [warnTriggerEmbed],
				});
			}
		}

		await interaction.editReply(`Warning issued to ${warnUser} | Total Warnings : ${newWarnCount}`);

		if (rawGuildData.warnBanThreshold != -1 && newWarnCount >= rawGuildData.warnBanThreshold) {
			let banReason = "Warn threshold reached";
			if (reason) {
				banReason += " | Reason : " + reason;
			}
			await targetUser.ban({ days: 7, reason: banReason });
			await interaction.channel.send({ content: `:no_entry: ${warnUser} has been banned` });
		} else if (rawGuildData.warnTimeoutThreshold != -1 && newWarnCount >= rawGuildData.warnTimeoutThreshold) {
			let timeoutReason = "Warn threshold reached";
			if (reason) {
				timeoutReason += " | Reason : " + reason;
			}
			let timeStamp = Math.floor(Date.now() / 1000 + rawGuildData.warnTimeoutDuration * 3600);
			await targetUser.timeout(rawGuildData.warnTimeoutDuration * 3600000, timeoutReason);
			await interaction.channel.send({ content: `:tools: ${warnUser} has been timed out, expires <t:${timeStamp}:R>` });
		}
	}
	static async checkWarn(interaction) {
		const durationMap = [
			{ name: "1 Hour", value: 1 },
			{ name: "12 Hour", value: 12 },
			{ name: "1 Day", value: 24 },
			{ name: "1 Week", value: 168 },
		];
		let rawGuildData = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		let user = interaction.options.getUser("user");
		if (!user) {
			let durationString = durationMap.find((item) => item.value === rawGuildData.warnTimeoutDuration);
			let auditChannel = await ClientHandler.getClientChannel(rawGuildData.warnAuditChannelId);
			if (!auditChannel) {
				auditChannel = `:red_circle: **OFF**`;
			}
			let warnCheckEmbed = new EmbedBuilder()
				.setColor("Blurple")
				.setTitle("Guild Name : " + rawGuildData.guildName)
				.setAuthor({
					name: config.botName + " : Warn Threshold Status",
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setFields(
					{
						name: "Timeout Threshold",
						value:
							rawGuildData.warnTimeoutThreshold != -1
								? `:green_circle: ${rawGuildData.warnTimeoutThreshold} warning(s)`
								: `:red_circle: **OFF**`,
					},
					{
						name: "Timeout Duration",
						value:
							rawGuildData.warnTimeoutDuration != -1 ? `:green_circle: ${durationString.name}` : `:red_circle: **OFF**`,
					},
					{
						name: "Ban Threshold",
						value:
							rawGuildData.warnBanThreshold != -1
								? `:green_circle: ${rawGuildData.warnBanThreshold} warning(s)`
								: `:red_circle: **OFF**`,
					},
					{
						name: "Audit Channel",
						value: `${auditChannel}`,
					},
				);

			await interaction.editReply({
				embeds: [warnCheckEmbed],
			});
		} else {
			let memberList = rawGuildData.memberList;
			let currentWarnCount = 0;
			let memberExists = memberList.findIndex((member) => member.userid == user.id);
			if (memberExists != -1) {
				currentWarnCount = memberList[memberExists].warnStat;
			}
			let userCheckEmbed = new EmbedBuilder()
				.setColor("Blurple")
				.setTitle("Guild Name : " + rawGuildData.guildName)
				.setAuthor({
					name: user.username,
					iconURL: ClientHandler.getAvatarUrl(user),
					url: config.botWebsite,
				})
				.setFields(
					{
						name: "User",
						value: `${user}`,
					},
					{
						name: "Current Warn Count",
						value: `${currentWarnCount}`,
					},
				);

			await interaction.editReply({
				embeds: [userCheckEmbed],
			});
		}
	}
	static async overrideUser(interaction) {
		let rawGuildData = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		let warnUser = interaction.options.getUser("user");
		let newWarnCount = interaction.options.getNumber("count");
		let memberList = rawGuildData.memberList;
		let memberExists = memberList.findIndex((member) => member.userid == warnUser.id);
		if (memberExists != -1) {
			//Member Exist
			memberList[memberExists].warnStat ??= 0; //If warnStat is undefined, set it to 0
			memberList[memberExists].warnStat = newWarnCount;
			memberList[memberExists].username = warnUser.username;
			await guildListSchema.findOneAndUpdate(
				{ guildId: interaction.guild.id },
				{
					$set: {
						guildName: interaction.guild.name,
						memberList: memberList,
					},
				},
			);
		} else {
			//Member Does Not Exist
			let guildUser = {
				userid: warnUser.id,
				username: warnUser.username,
				levelStat: 0,
				warnStat: newWarnCount,
			};
			memberList.push(guildUser);
			await guildListSchema.findOneAndUpdate(
				{ guildId: interaction.guild.id },
				{
					$set: {
						guildName: interaction.guild.name,
						memberList: memberList,
					},
				},
			);
		}
		await interaction.editReply(`Warn count for ${warnUser} has been now set to \`${newWarnCount}\``);
	}
}

module.exports = WarnHandler;
