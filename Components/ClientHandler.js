const { REST, Routes, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
require("dotenv").config();
let clientPerms = {
	CREATE_INSTANT_INVITE: 0x0000000001n,
	KICK_MEMBERS: 0x0000000002n,
	BAN_MEMBERS: 0x0000000004n,
	ADMINISTRATOR: 0x0000000008n,
	MANAGE_CHANNELS: 0x0000000010n,
	MANAGE_GUILD: 0x0000000020n,
	ADD_REACTIONS: 0x0000000040n,
	VIEW_AUDIT_LOG: 0x0000000080n,
	PRIORITY_SPEAKER: 0x0000000100n,
	STREAM: 0x0000000200n,
	VIEW_CHANNEL: 0x0000000400n,
	SEND_MESSAGES: 0x0000000800n,
	SEND_TTS_MESSAGES: 0x0000001000n,
	MANAGE_MESSAGES: 0x0000002000n,
	EMBED_LINKS: 0x0000004000n,
	ATTACH_FILES: 0x0000008000n,
	READ_MESSAGE_HISTORY: 0x0000010000n,
	MENTION_EVERYONE: 0x0000020000n,
	USE_EXTERNAL_EMOJIS: 0x0000040000n,
	VIEW_GUILD_INSIGHTS: 0x0000080000n,
	CONNECT: 0x0000100000n,
	SPEAK: 0x0000200000n,
	MUTE_MEMBERS: 0x0000400000n,
	DEAFEN_MEMBERS: 0x0000800000n,
	MOVE_MEMBERS: 0x0001000000n,
	USE_VAD: 0x0002000000n,
	CHANGE_NICKNAME: 0x0004000000n,
	MANAGE_NICKNAMES: 0x0008000000n,
	MANAGE_ROLES: 0x0010000000n,
	MANAGE_WEBHOOKS: 0x0020000000n,
	MANAGE_EMOJIS_AND_STICKERS: 0x0040000000n,
	USE_APPLICATION_COMMANDS: 0x0080000000n,
	REQUEST_TO_SPEAK: 0x0100000000n,
	MANAGE_THREADS: 0x0400000000n,
	USE_PUBLIC_THREADS: 0x0800000000n,
	USE_PRIVATE_THREADS: 0x1000000000n,
	USE_EXTERNAL_STICKERS: 0x2000000000n,
};
let commandIdList = [];
class ClientHandler {
	client;
	static async setClient(client) {
		this.client = client;
	}
	static async getClientUptime() {
		return Math.round((Date.now() - this.client.uptime) / 1000);
	}
	static async getClientInvite() {
		let link = this.client.generateInvite({
			permissions: [PermissionFlagsBits.Administrator],
			scopes: ["bot", "applications.commands"],
		});
		return link;
	}
	static async getClient() {
		return this.client;
	}
	static async getClientVoiceRegions(pure = false) {
		return this.client
			.fetchVoiceRegions()
			.then((regions) =>
				regions.filter((region) => !region.deprecated).map((region) => (pure ? region.toJSON() : region.id)),
			);
	}
	static getMongoStatus() {
		return mongoose.connection.readyState;
	}
	static getAvatarUrl(user) {
		if (user?.avatar === null) {
			return "https://cdn.discordapp.com/embed/avatars/0.png";
		}
		return "https://cdn.discordapp.com/avatars/" + user?.id + "/" + user?.avatar + ".jpeg";
	}
	static getPermissions(bitField, type) {
		bitField = BigInt(bitField);
		let permsArray = Object.entries(clientPerms)
			.filter(([_perm_name, perm_bitfield]) => {
				return (bitField & perm_bitfield) == perm_bitfield;
			})
			.map(([perm]) => perm);
		if (permsArray.length === 0) {
			permsArray = ["NONE"];
		}
		if (type === 0) {
			return permsArray;
		} else if (type === 1) {
			return permsArray.join(", ");
		} else if (type === 2) {
			return permsArray.map((perm) => `\`${perm}\``).join(", ");
		}
	}
	static async setCommandIdList() {
		let rest = new REST({ version: "10" }).setToken(this.getToken());
		await rest.get(Routes.applicationCommands(this.client.user.id)).then((globalData) => {
			globalData.map((data) => {
				let obj = { name: data.name, id: data.id };
				commandIdList.push(obj);
			});
		});
	}
	static getCommandId(name) {
		let id;
		commandIdList.map((command) => {
			if (command.name === name) {
				id = command.id;
			}
		});
		return id;
	}
	static async destroyClient() {
		this.client.destroy();
	}
	static async getClientId() {
		return this.client.user.id;
	}
	static getToken() {
		let token;
		process.env.botMode === "dev" ? (token = process.env.devToken) : (token = process.env.token);
		return token;
	}
	static async getClientGuild(id) {
		let returnGuild = this.client.guilds.cache.find((guild) => guild.id === id);
		return returnGuild;
	}
	static async getClientChannel(id) {
		let returnChannel = this.client.channels.cache.find((channel) => channel.id === id);
		return returnChannel;
	}
	static async getClientBotUser() {
		return this.client.user;
	}
	static async getClientUser(id) {
		let returnUser = this.client.users.cache.find((user) => user.id === id);
		return returnUser;
	}
	static async getClientGuildMember(guildId, userId) {
		let returnGuild = this.client.guilds.cache.find((guild) => guild.id === guildId);
		if (!returnGuild) {
			return returnGuild;
		}
		let returnUser = returnGuild.members.cache.find((user) => user.user.id === userId);
		return returnUser;
	}
	static async getClientGuildRole(guildId, roleId) {
		let returnGuild = this.client.guilds.cache.find((guild) => guild.id === guildId);
		if (!returnGuild) {
			return returnGuild;
		} else {
			let returnRole = (await returnGuild.roles.fetch()).find((role) => role.id === roleId);
			return returnRole;
		}
	}
	static async getClientGuildSystemChannel(guildId) {
		let returnGuild = this.client.guilds.cache.find((guild) => guild.id === guildId);
		if (!returnGuild) {
			return returnGuild;
		} else {
			let returnChannel = returnGuild.systemChannel;
			return returnChannel;
		}
	}
	static async getClientGuildPostChannel(guildId, preferences) {
		let returnGuild = this.client.guilds.cache.find((guild) => guild.id === guildId);
		if (!returnGuild) {
			return returnGuild;
		} else {
			let returnChannel;
			if (preferences) {
				returnChannel = returnGuild.channels.cache.find(
					(channel) =>
						channel.type === 0 && preferences.some((preference) => !!channel.name.match(new RegExp(`${preference}`))),
				);
			}
			if (!returnChannel) {
				returnChannel = returnGuild.systemChannel;
			}
			if (!returnChannel) {
				returnChannel = returnGuild.channels.cache.find(
					(channel) =>
						channel.isTextBased() &&
						channel.type === 0 &&
						channel.permissionsFor(returnGuild.members.me).has(PermissionFlagsBits.SendMessages),
				);
			}
			return returnChannel;
		}
	}
}

module.exports = ClientHandler;
