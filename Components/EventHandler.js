const eventLogSchema = require("../Managers/Schemas/eventLogSchema");
const debugLogSchema = require("../Managers/Schemas/debugLogSchema");
const errorLogSchema = require("../Managers/Schemas/errorLogSchema");
const { yellowBright, bgBlack, cyanBright, redBright, greenBright, white } = require("colorette");
const DiscordEventHandler = require("./DiscordEventHandler");
const ClientHandler = require("./ClientHandler");
var pjson = require("../package.json");
const config = require("../config.json");
require("dotenv").config();
let debugState = true;
let tempEvents = [];
class EventHandler {
	static async getDebugState() {
		return debugState;
	}

	static async setDebugState(state) {
		debugState = state ?? false;
	}
	static async auditEvent(type, desc, event) {
		let auditData = {
			botVersion: pjson.version,
			envMode: process.env.botMode,
			eventType: type,
			desc,
			event: event,
		};
		if (type === "LOG") {
			console.log(`[${cyanBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "INFO") {
			console.log(`[${greenBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "DM_INFO") {
			console.log(`[${greenBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "NOTICE") {
			console.log(`[${greenBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "DEBUG" && debugState) {
			console.log(`[${yellowBright(type)}] ${bgBlack(white(desc))}`);
		} else if (type === "ERROR") {
			console.log(`[${redBright(type)}] ${bgBlack(white(desc))}`);
		}

		if (event && !["DM_INFO", "DEBUG"].includes(type)) {
			console.log(event);
		}
		try {
			if ((process.env.botMode === "dev" && config.devLogging === "true") || process.env.botMode === "prod") {
				if (type === "LOG" || type === "DM_INFO" || type === "INFO" || type === "NOTICE") {
					this.logConsoleEvent(type, desc, event);
				} else if (type === "DEBUG" && debugState) {
					new debugLogSchema(auditData).save();
				} else if (type === "ERROR") {
					new errorLogSchema(auditData).save();
				}

				if (type === "ERROR") {
					await DiscordEventHandler.sendDiscordErrorEvent(type, desc, event);
				} else if (type === "DEBUG") {
					if (debugState) {
						await DiscordEventHandler.sendDiscordDebugEvent(type, desc, event);
					}
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
	static async logConsoleEvent(type, desc, event) {
		const timestamp = Date.now();
		const currPush = !!event ? { type, desc, event, timestamp } : { type, desc, timestamp };
		if (ClientHandler.getMongoStatus()) {
			const currentDate = new Date().toISOString().slice(0, 10);
			let currPushArray = [];
			if (tempEvents.length > 0) {
				currPushArray.push(...tempEvents);
				tempEvents = [];
			}
			currPushArray.push(currPush);
			await eventLogSchema.findOneAndUpdate(
				{ date: currentDate, botVersion: process.env.npm_package_version, envMode: process.env.botMode },
				{
					$setOnInsert: {
						botVersion: process.env.npm_package_version,
						envMode: process.env.botMode,
						date: currentDate,
					},
					$push: { events: currPushArray },
				},
				{ upsert: true },
			);
		} else {
			tempEvents.push(currPush);
		}
	}
}
module.exports = EventHandler;
