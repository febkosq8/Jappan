const logEvent = require("../Managers/Schemas/logSchema");
const { yellowBright, bgBlack, cyanBright, redBright, greenBright, white } = require("colorette");
const DiscordEventHandler = require("./DiscordEventHandler");
const ClientHandler = require("./ClientHandler");
var pjson = require("../package.json");
const config = require("../config.json");
require("dotenv").config();
class EventHandler {
	static async auditEvent(type, desc, event) {
		let auditData = {
			timeStamp: new Date().toISOString(),
			botVersion: pjson.version,
			envMode: process.env.botMode,
			eventType: type,
			desc: desc,
			event: event,
		};
		if (type === "LOG") {
			console.log(`[${cyanBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "INFO") {
			console.log(`[${greenBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "DM_INFO") {
			console.log(`[${greenBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "DEBUG") {
			console.log(`[${yellowBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "ERROR") {
			console.log(`[${redBright(type)}] ${bgBlack(white(desc))}`);
		}

		if (event && type !== "DM_INFO") {
			console.log(event);
		}
		try {
			if ((process.env.botMode === "dev" && config.devLogging === "true") || process.env.botMode === "prod") {
				if (ClientHandler.getMongoStatus() === 1) {
					new logEvent(auditData).save();
				}
				if (type === "ERROR") {
					await DiscordEventHandler.sendDiscordErrorEvent(type, desc, event);
				} else if (type === "DEBUG") {
					// await DiscordEventHandler.sendDiscordDebugEvent(type, desc, event);
				} else if (type === "DM_INFO") {
					await DiscordEventHandler.sendDiscordDMEvent(event);
				} else {
					await DiscordEventHandler.sendDiscordEvent(type, desc, event);
				}
			}
		} catch (error) {
			console.log(error);
		}
	}
}
module.exports = EventHandler;
