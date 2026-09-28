import { writeLog } from "../helpers/logger.js";

export interface Config {
	readonly ENVIRONMENT: string;
	readonly DISCORD_TOKEN: string;
	BOT_NAME: string;
	BOT_PFP: string;
	readonly BOT_WEBSITE: string;
	readonly DB_URL: string;
	readonly ADMIN_USER_IDS: readonly string[];
	readonly LOG_TIMESTAMP: boolean;
	readonly PLAYER_DEBUG: boolean;
	readonly ENABLE_EVENTS_DEBUG: readonly string[];
	readonly SHUTDOWN_THREASHOLD: number;
}

let loadedConfig: Config | undefined;

const configTemplate: Partial<Record<keyof Config, string>> = {
	ENVIRONMENT: "PRODUCTION",
	BOT_NAME: "Jappan",
	BOT_PFP: "https://jappan.febkosq8.me/assets/Profile-FDHZtz5Q.png",
	BOT_WEBSITE: "https://jappan.febkosq8.me",
	ADMIN_USER_IDS: "",
	LOG_TIMESTAMP: "false",
	PLAYER_DEBUG: "false",
	ENABLE_EVENTS_DEBUG: "false",
	SHUTDOWN_THREASHOLD: "3",
};

function readConfigValue(name: keyof Config, required = false): string {
	const value = process.env[name]?.trim();
	if (value) {
		return value;
	}

	const defaultValue = configTemplate[name];
	if (defaultValue !== undefined) {
		return defaultValue;
	} else if (required) {
		throw new Error(`${name} is required`);
	}

	throw new Error(`${name} has no value or default`);
}

export function loadConfig(): Config {
	const DISCORD_TOKEN = readConfigValue("DISCORD_TOKEN", true);
	const ENVIRONMENT = readConfigValue("ENVIRONMENT");
	const BOT_NAME = readConfigValue("BOT_NAME");
	const BOT_PFP = readConfigValue("BOT_PFP");
	const BOT_WEBSITE = readConfigValue("BOT_WEBSITE");
	const DB_URL = readConfigValue("DB_URL", true);
	const adminUserIdsValue = readConfigValue("ADMIN_USER_IDS");
	const ADMIN_USER_IDS = adminUserIdsValue
		.split(";")
		.map((userId) => userId.trim())
		.filter(Boolean);
	const LOG_TIMESTAMP = readConfigValue("LOG_TIMESTAMP") === "true";
	const PLAYER_DEBUG = readConfigValue("PLAYER_DEBUG") === "true";
	const eventsDebugValue = readConfigValue("ENABLE_EVENTS_DEBUG");
	const ENABLE_EVENTS_DEBUG =
		eventsDebugValue.toLowerCase() === "false"
			? []
			: eventsDebugValue
					.split(";")
					.map((eventName) => eventName.trim())
					.filter(Boolean);
	const shutdownThresholdValue = Number.parseInt(readConfigValue("SHUTDOWN_THREASHOLD"), 10);
	if (!Number.isInteger(shutdownThresholdValue) || shutdownThresholdValue < 1) {
		throw new Error("SHUTDOWN_THREASHOLD must be a positive integer");
	}
	const SHUTDOWN_THREASHOLD = shutdownThresholdValue;
	loadedConfig = {
		DISCORD_TOKEN,
		ENVIRONMENT,
		BOT_NAME,
		BOT_PFP,
		BOT_WEBSITE,
		DB_URL,
		ADMIN_USER_IDS,
		LOG_TIMESTAMP,
		PLAYER_DEBUG,
		ENABLE_EVENTS_DEBUG,
		SHUTDOWN_THREASHOLD,
	};
	if (ADMIN_USER_IDS.length > 0) {
		writeLog({
			level: "info",
			category: "BOT",
			message: "Admin users are now loaded",
			details: { count: ADMIN_USER_IDS.length },
		});
	}
	return loadedConfig;
}

export function getConfig(): Config;
export function getConfig<Key extends keyof Config>(property: Key): Config[Key];
export function getConfig(property?: keyof Config): Config | Config[keyof Config] {
	if (!loadedConfig) {
		throw new Error("Configuration has not been loaded");
	} else if (property === undefined) {
		return loadedConfig;
	} else if (!(property in loadedConfig)) {
		throw new Error(`Configuration property "${String(property)}" does not exist`);
	}

	return loadedConfig[property];
}
