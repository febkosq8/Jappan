import { writeLog, type LogCategory, type LogDetails } from "../helpers/logger.js";

export const logger = {
	debug: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog({ level: "debug", category, message, ...(details ? { details } : {}) }),
	info: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog({ level: "info", category, message, ...(details ? { details } : {}) }),
	success: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog({ level: "success", category, message, ...(details ? { details } : {}) }),
	warn: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog({ level: "warn", category, message, ...(details ? { details } : {}) }),
	error: (category: LogCategory, message: string, details?: LogDetails): void =>
		writeLog({ level: "error", category, message, ...(details ? { details } : {}) }),
};
