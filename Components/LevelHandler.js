const guildListSchema = require("../Managers/Schemas/guildListSchema");
const EventHandler = require("../Components/EventHandler");
const GuildHandler = require("../Components/GuildHandler");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config.json");
const ClientHandler = require("../Components/ClientHandler");
var memberTimeList = [];
class LevelHandler {
	static async levelOn(interaction) {
		let guildId = interaction.guildId;
		let guildName = interaction.member.guild.name;
		let threshold = interaction.options.get("threshold");
		let levelRole = await interaction.options.getRole("role");
		if (threshold && levelRole) {
			//Level On with role and threshold
			let clientId = await ClientHandler.getClientId();
			let botMember = await ClientHandler.getClientGuildMember(guildId, clientId);
			let highBotRole = botMember.roles.botRole;
			let botRolesList = botMember.roles.cache;
			botRolesList.forEach((role) => {
				if (role.position > highBotRole.position) {
					highBotRole = role;
				}
			});
			if (highBotRole.position > levelRole.position && levelRole.editable) {
				await guildListSchema.findOneAndUpdate(
					{ guildId: guildId },
					{
						$set: {
							levelActive: true,
							guildName: guildName,
							levelThreshold: threshold.value,
							levelRoleId: levelRole.id,
							levelRoleName: levelRole.name,
						},
					},
				);
				return 2;
			} else {
				return 0;
			}
		} else if (threshold || levelRole) {
			//Level On with role or threshold FAIL
			return 1;
		} else {
			//Level On with no role and threshold
			await guildListSchema.findOneAndUpdate(
				{ guildId: guildId },
				{
					$set: {
						levelActive: true,
						guildName: guildName,
						levelThreshold: "",
						levelRoleId: "",
						levelRoleName: "",
					},
				},
			);
			return 2;
		}
	}
	static async levelOff(guildId) {
		await guildListSchema.findOneAndUpdate(
			{ guildId: guildId },
			{
				$set: {
					levelActive: false,
					levelThreshold: "",
					levelRoleId: "",
					levelRoleName: "",
				},
			},
		);
	}
	static async checkLevelStatus(interaction) {
		let rawGuildData = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		let levelEmbed = new EmbedBuilder()
			.setColor("Blurple")
			.setTitle("Guild Name : " + rawGuildData.guildName)
			.setAuthor({
				name: config.botName + " : Leveling Status",
				iconURL: config.botpfp,
				url: config.botWebsite,
			});
		if (rawGuildData?.levelActive) {
			levelEmbed.addFields({
				name: "Leveling Feature",
				value: `:green_circle: **ON**`,
			});
		} else {
			levelEmbed.addFields({
				name: "Leveling Feature",
				value: `:red_circle: **OFF**`,
			});
		}
		if (rawGuildData?.levelThreshold) {
			let role = await ClientHandler.getClientGuildRole(interaction.guildId, rawGuildData?.levelRoleId);
			levelEmbed.addFields(
				{
					name: "Stat Threshold",
					value: `**${rawGuildData?.levelThreshold}**`,
				},
				{ name: "Award Role", value: `${role}` },
			);
		}
		await interaction.editReply({
			embeds: [levelEmbed],
		});
	}
	static async fetchLeaderboard(interaction) {
		let noLevelEmbed = new EmbedBuilder()
			.setColor("Orange")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("Leaderboard : " + interaction.member.guild.name)
			.setDescription(
				":exclamation::x: " +
					interaction.member.guild.name +
					" doesn't have the leveling system enabled.\nPlease ask a moderator to enable leveling system in " +
					interaction.member.guild.name +
					".",
			)
			.setTimestamp();
		let rawGuildData = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		if (rawGuildData) {
			let levelEmbed = await this.getLeaderboardEmbed(interaction, 1);
			let pageCount = parseInt(levelEmbed.data.footer.text.match(/\d+/g)[1]);
			if (pageCount !== 1) {
				const butttonLabelList = [
					{
						key: "FrontLeaderboard|" + interaction.user.id,
						value: "Next Page ▶️",
					},
				];

				let buttonRow = new ActionRowBuilder();
				for (let i = 0; i < butttonLabelList.length; i++) {
					buttonRow.addComponents(
						new ButtonBuilder()
							.setCustomId(butttonLabelList[i].key)
							.setLabel(butttonLabelList[i].value)
							.setStyle(ButtonStyle.Primary),
					);
				}
				await interaction.editReply({
					embeds: [levelEmbed],
					components: [buttonRow],
				});
			} else {
				await interaction.editReply({
					embeds: [levelEmbed],
				});
			}
		} else {
			await interaction.editReply({
				embeds: [noLevelEmbed],
			});
		}
	}
	static async getLeaderboardEmbed(interaction, newPage) {
		let rawGuildData = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		let levelDescr;
		let role = await ClientHandler.getClientGuildRole(interaction.guildId, rawGuildData?.levelRoleId);
		if (rawGuildData?.levelRoleId) {
			levelDescr =
				":globe_with_meridians: Award users with " +
				`${role}` +
				" once the user stat reach " +
				`\`${rawGuildData?.levelThreshold}\``;
		} else {
			levelDescr =
				":chart_with_upwards_trend: Gain more stat points by being active through messages, interactions or voice channels";
		}

		let memberList = rawGuildData?.memberList;
		function compareStat(a, b) {
			return b.levelStat - a.levelStat;
		}
		memberList.sort(compareStat);
		var memberArray = await Promise.all(
			memberList.map(async (m) => {
				let user = await ClientHandler.getClientUser(m.userid);
				if (!user) {
					return `${m.username} : ${m.levelStat}`;
				}
				return `${user} : ${m.levelStat}`;
			}),
		);
		if (memberArray.length === 0) {
			memberArray = [":x: No member stat's were found :x:"];
		}
		let tempCount = 0;
		let tempString = "";
		var memberStringArray = [];
		memberArray.map((m, index) => {
			tempCount++;
			tempString += m + `\n`;
			if (memberArray.length === index + 1 || tempCount === 20) {
				tempCount = 0;
				memberStringArray.push(tempString);
				tempString = "";
			}
		});
		let pageCount = Math.ceil(memberList.length / 20);
		if (newPage > pageCount) {
			return -1;
		}
		let levelEmbed = new EmbedBuilder()
			.setColor("Orange")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("Leaderboard : " + interaction.member.guild.name)
			.setDescription(levelDescr)
			.setTimestamp()
			.addFields({
				name: "Member Stats",
				value: memberStringArray[newPage - 1],
			})
			.setFooter({
				text: "Page " + `${newPage}` + " of " + `${pageCount}`,
			});
		return levelEmbed;
	}
	static async checkGuildMessage(message) {
		let levelStatus = await guildListSchema.findOne({
			guildId: message.guildId,
		});
		if (levelStatus) {
			if (levelStatus?.levelActive) {
				this.analyzeMessage(message);
			}
		} else {
			let guild = message.guild;
			GuildHandler.initGuild(guild.id, guild.name);
		}
	}
	static async analyzeMessage(message) {
		let statMessage = message.content.length;
		statMessage = Math.min(statMessage, 12);
		statMessage = Math.floor(Math.random() * statMessage);
		this.awardLevelStatMember(message.guild, message.author, statMessage, "message", message);
	}
	static async checkGuildInteraction(interaction) {
		let levelStatus = await guildListSchema.findOne({
			guildId: interaction.guildId,
		});
		if (levelStatus) {
			if (levelStatus?.levelActive) {
				this.analyzeInteraction(interaction);
			}
		} else {
			let guild = interaction.guild;
			GuildHandler.initGuild(guild.id, guild.name);
		}
	}
	static async analyzeInteraction(interaction) {
		let statMessage;
		if (interaction.isButton()) {
			statMessage = interaction.customId.length;
		} else {
			statMessage = interaction.commandName.length;
		}
		statMessage = Math.min(statMessage, 12);
		statMessage = Math.max(1, Math.floor(Math.random() * statMessage));
		this.awardLevelStatMember(interaction.guild, interaction.user, statMessage, "interaction", interaction);
	}
	static async checkGuildVoice(state, type, timeStamp) {
		let levelStatus = await guildListSchema.findOne({
			guildId: state.guild.id,
		});
		if (levelStatus && !state?.member?.user?.bot) {
			if (levelStatus?.levelActive) {
				if (type === "join") {
					this.analyzeVoiceJoin(state, timeStamp);
				} else {
					this.analyzeVoiceLeave(state, timeStamp);
				}
			}
		} else {
			let guild = state.guild;
			GuildHandler.initGuild(guild.id, guild.name);
		}
	}
	static async analyzeVoiceJoin(state, timeStamp) {
		let status = 0;
		memberTimeList.forEach((member) => {
			if (member.id === state.id) {
				member.timeStamp = timeStamp;
				status++;
			}
		});
		if (status === 0) {
			memberTimeList.push({ id: state.id, timeStamp: timeStamp });
			status++;
		}
	}
	static async analyzeVoiceLeave(state, timeStamp) {
		let status = 0;
		let joinTimeStamp;
		let diff;
		let indexToRemove;
		memberTimeList.forEach((member, index) => {
			if (member.id === state.id) {
				joinTimeStamp = member.timeStamp;
				status++;
				indexToRemove = index + 1;
			}
		});
		if (indexToRemove) {
			memberTimeList.splice(indexToRemove - 1, 1);
		}
		if (status === 1) {
			diff = Math.round((timeStamp - joinTimeStamp) / 60000);
			diff = Math.round(diff * 0.25); //1 min = 0.25 points
			diff = 1;
			if (diff > 0) {
				this.awardLevelStatMember(state?.guild, state?.member?.user, diff, "voice", state);
			}
		}
	}
	static async awardLevelStatMember(guild, guildMember, statPoints, type, instance) {
		try {
			let guildDetail = await guildListSchema.findOne({
				guildId: guild.id,
			});
			let memberList = guildDetail?.memberList;
			let memberExists = memberList.findIndex((member) => member.userid == guildMember.id);
			let statMessage = statPoints;
			if (memberExists != -1) {
				//Member Exist
				memberList[memberExists].levelStat ??= 0; //If levelStat is undefined, set it to 0
				memberList[memberExists].levelStat += statMessage;
				memberList[memberExists].username = guildMember.username;
				await guildListSchema.findOneAndUpdate(
					{ guildId: guild.id },
					{
						$set: {
							guildName: guild.name,
							memberList: memberList,
						},
					},
				);
			} else {
				//Member Does Not Exist
				let guildUser = {
					userid: guildMember.id,
					username: guildMember.username,
					levelStat: statMessage,
					warnStat: 0,
				};
				memberList.push(guildUser);
				await guildListSchema.findOneAndUpdate(
					{ guildId: guild.id },
					{
						$set: {
							guildName: guild.name,
							memberList: memberList,
						},
					},
				);
			}

			if (guildDetail?.levelThreshold && guildDetail?.levelRoleId && guildDetail?.levelRoleName) {
				let currRole = await ClientHandler.getClientGuildRole(guild.id, guildDetail?.levelRoleId);
				let currMember = await ClientHandler.getClientGuildMember(guild.id, guildMember.id);
				let hasRole = false;
				if (statMessage > guildDetail?.levelThreshold) {
					currMember.roles.cache.forEach((role) => {
						if (role.name === guildDetail?.levelRoleName) {
							hasRole = true;
						}
					});
				}
				if (type === "voice" && !hasRole && statMessage > guildDetail?.levelThreshold) {
					try {
						let postChannel = await ClientHandler.getClientChannel(instance.channelId);
						await currMember.roles.add(currRole);
						postChannel.send({
							content: `${currMember} just leveled up !`,
						});
					} catch (error) {
						this.levelOff(guild.id);
						postChannel.send({
							content: `${currMember} just leveled up but we failed to assign a role. To avoid more issues we turned off the leveling functionality. Please re-enable the leveling system !`,
						});
						EventHandler.auditEvent(
							"ERROR",
							"Failed to assign level (Voice) role to member in Guild : " +
								guildDetail?.guildName +
								" / " +
								guildDetail?.guildId +
								" with Error : " +
								error,
							error,
						);
					}
				} else if (type === "message" && !hasRole && statMessage > guildDetail?.levelThreshold) {
					try {
						await currMember.roles.add(currRole);
						instance.reply({
							content: `${currMember} just leveled up !`,
						});
					} catch (error) {
						this.levelOff(guild.id);
						instance.reply({
							content: `${currMember} just leveled up but we failed to assign a role. To avoid more issues we turned off the leveling functionality. Please re-enable the leveling system !`,
						});
						EventHandler.auditEvent(
							"ERROR",
							"Failed to assign level (Message) role to member in Guild : " +
								guildDetail.guildName +
								" / " +
								guildDetail.guildId +
								" with Error : " +
								error,
							error,
						);
					}
				} else if (type === "interaction" && !hasRole && statMessage > guildDetail.levelThreshold) {
					try {
						await currMember.roles.add(currRole);
						instance.followUp({
							content: `${currMember} just leveled up !`,
						});
					} catch (error) {
						this.levelOff(guild.id);
						instance.followUp({
							content: `${currMember} just leveled up but we failed to assign a role. To avoid more issues we turned off the leveling functionality. Please re-enable the leveling system !`,
						});
						EventHandler.auditEvent(
							"ERROR",
							"Failed to assign level (Interaction) role to member in Guild : " +
								guildDetail.guildName +
								" / " +
								guildDetail.guildId +
								" with Error : " +
								error,
							error,
						);
					}
				}
			}
		} catch (error) {
			EventHandler.auditEvent(
				"ERROR",
				"Failed to award Level points in Guild ID : " +
					guild.id +
					" for Member ID : " +
					guildMember.id +
					" with Error : " +
					error,
				error,
			);
		}
	}
	static async cleanGuildMember(threshold) {
		let rawGuildData = await guildListSchema.find();
		let count = 0;
		rawGuildData.forEach(async (guild) => {
			let memberList = guild.memberList;
			let newMemberList = [];
			memberList.forEach((member) => {
				if (member.levelStat > threshold) {
					newMemberList.push(member);
				} else {
					count++;
				}
			});
			await guildListSchema.findOneAndUpdate(
				{ guildId: guild.guildId },
				{
					$set: {
						memberList: newMemberList,
					},
				},
			);
		});
		return count;
	}
}

module.exports = LevelHandler;
