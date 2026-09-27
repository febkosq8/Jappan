import { writeLog, type LogCategory, type LogDetails } from "../helpers/logger.js";

export const logger = {
	debug: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog("debug", category, message, details),
	info: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog("info", category, message, details),
	success: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog("success", category, message, details),
	warn: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog("warn", category, message, details),
	error: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog("error", category, message, details),
};
