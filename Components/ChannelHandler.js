const { ChannelType, VoiceRegion, PermissionFlagsBits } = require("discord.js");
const ClientHandler = require("./ClientHandler");
const GuildHandler = require("./GuildHandler");

class ChannelHandler {
	static async handleVoiceChange(oldState, newState) {
		try {
			const mongoStatus = ClientHandler.getMongoStatus();
			if (!mongoStatus) return;
			const regions = await ClientHandler.getClientVoiceRegions();
			const guildPreferences = await GuildHandler.getGuildPreferences(newState.guild.id);
			const regionWatchMembers = guildPreferences.regionWatchMembers;
			if (regionWatchMembers.length > 0) {
				const currChannel = newState.channel ?? oldState.channel;
				const currUser = newState.member.user;
				const userMontiorPreferencesIndex = regionWatchMembers.findIndex((member) => member.user.id === currUser.id);
				if (userMontiorPreferencesIndex >= 0) {
					const voiceJoinEvent = newState.channel !== null;
					const userMontiorPreferences = regionWatchMembers[userMontiorPreferencesIndex];
					if (currChannel.id === userMontiorPreferences.channel.id) {
						const canBotEditChannel = newState.guild.members.me
							.permissionsIn(currChannel)
							.has(PermissionFlagsBits.ManageChannels);
						if (!canBotEditChannel) {
							let postChannel = await ClientHandler.getClientGuildPostChannel(newState.guild.id, [
								currChannel.name,
								"general",
							]);
							const canSendMessages = newState.guild.members.me
								.permissionsIn(postChannel)
								.has(PermissionFlagsBits.SendMessages);
							if (canSendMessages) {
								await postChannel.send(
									`:x: Free Speech has been disabled for ${currUser} in ${currChannel} since I have lost permission to modify ${currChannel} !`,
								);
							}
							await GuildHandler.updateGuildPreferences(newState.guild.id, {
								$unset: {
									[`regionWatchMembers.${userMontiorPreferencesIndex}`]: "",
								},
							});
							return await GuildHandler.updateGuildPreferences(newState.guild.id, {
								$pull: { regionWatchMembers: null },
							});
						}
						if (voiceJoinEvent) {
							const currChannelUsers = currChannel.members.map((member) => member.user);
							const regionPreferenceForExistingUsers = regionWatchMembers.filter((member) =>
								currChannelUsers.some(
									(user) =>
										user.id === member.user.id && member.channel.id === currChannel.id && user.id !== currUser.id,
								),
							);
							const isRegionPreferenceAlreadySet = regionPreferenceForExistingUsers.some(
								(member) => !!member.fallbackRegion,
							);
							if (!isRegionPreferenceAlreadySet && userMontiorPreferences.region !== currChannel.rtcRegion) {
								if (regions.includes(userMontiorPreferences.region)) {
									userMontiorPreferences.fallbackRegion = currChannel.rtcRegion;
									await GuildHandler.updateGuildPreferences(newState.guild.id, {
										$set: {
											[`regionWatchMembers.${userMontiorPreferencesIndex}`]: userMontiorPreferences,
										},
									});
									await currChannel.setRTCRegion(
										userMontiorPreferences.region ?? userMontiorPreferences.fallbackRegion ?? null,
									);
								} else {
									currChannel.send(
										`${currUser} had a region preference of \`${userMontiorPreferences.region}\` but it is no longer a valid region, hence RegionWatch has been removed for this user. Please update the region preference using \`/regionwatch add\``,
									);
									await GuildHandler.updateGuildPreferences(newState.guild.id, {
										$unset: {
											[`regionWatchMembers.${userMontiorPreferencesIndex}`]: "",
										},
									});
									await GuildHandler.updateGuildPreferences(newState.guild.id, {
										$pull: { regionWatchMembers: null },
									});
								}
							}
						} else {
							if (userMontiorPreferences.fallbackRegion) {
								await currChannel.setRTCRegion(userMontiorPreferences.fallbackRegion ?? null);
							}
						}
					}
				}
			}
		} catch (error) {
			EventHandler.auditEvent("ERROR", "FATAL Error in ChannelHandler/handleVoiceChange", error);
			EventHandler.auditEvent("DEBUG", "Error in ChannelHandler/handleVoiceChange", {
				error,
				debug: { oldState, newState },
			});
		}
	}
}

module.exports = ChannelHandler;
