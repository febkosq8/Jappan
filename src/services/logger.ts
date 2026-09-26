import { writeLog, type LogDetails } from "../helpers/logger.js";

export const logger = {
	info: (category: string, message: string, details?: LogDetails): void => writeLog("info", category, message, details),
	success: (category: string, message: string, details?: LogDetails): void =>
		writeLog("success", category, message, details),
	warn: (category: string, message: string, details?: LogDetails): void => writeLog("warn", category, message, details),
	error: (category: string, message: string, details?: LogDetails): void =>
		writeLog("error", category, message, details),
};
