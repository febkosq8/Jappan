import mongoose from "mongoose";

import "../models/guild.js";
import "../models/guildMemberState.js";
import "../models/userPlaylist.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

export interface DatabaseInitOptions {
	successCallback?: () => void | Promise<void>;
}

class DatabaseManager {
	private static connectionPromise: Promise<typeof mongoose> | undefined;
	private static hasConnected = false;
	private static hasExited = false;
	private static listenersRegistered = false;

	private static registerConnectionListeners(): void {
		if (this.listenersRegistered) {
			return;
		}

		mongoose.connection.on("open", () => {
			logger.success("DATABASE", "MongoDB connected", {
				database: mongoose.connection.name,
			});
		});
		mongoose.connection.on("reconnected", () => {
			logger.info("DATABASE", "MongoDB reconnected");
		});
		mongoose.connection.on("error", (error: Error) => {
			if (this.hasConnected) {
				logger.error("DATABASE", "MongoDB connection error", { error });
			}
		});
		mongoose.connection.on("disconnected", () => {
			if (!this.hasExited && this.hasConnected) {
				logger.warn("DATABASE", "MongoDB disconnected");
			}
		});

		this.listenersRegistered = true;
	}

	private static async syncIndexes(): Promise<void> {
		for (const modelName of mongoose.modelNames()) {
			try {
				await mongoose.model(modelName).syncIndexes();
				logger.info("DATABASE", "MongoDB indexes synchronized", {
					model: modelName,
				});
			} catch (error: unknown) {
				logger.error("DATABASE", "MongoDB index synchronization failed", {
					model: modelName,
					error,
				});
				throw error;
			}
		}
	}

	static getDatabaseStatus(): boolean {
		return mongoose.connection.readyState === 1;
	}

	static getDatabaseInstance(): mongoose.mongo.Db {
		return mongoose.connection.db as mongoose.mongo.Db;
	}

	static getClient(): mongoose.mongo.MongoClient {
		return mongoose.connection.getClient() as mongoose.mongo.MongoClient;
	}

	static async init({ successCallback }: DatabaseInitOptions = {}): Promise<typeof mongoose> {
		this.hasExited = false;
		this.registerConnectionListeners();

		if (mongoose.connection.readyState === 1) {
			await this.syncIndexes();
			this.hasConnected = true;
			if (successCallback) {
				await successCallback();
			}
			return mongoose;
		}

		if (!this.connectionPromise) {
			logger.info("DATABASE", "Connecting to MongoDB");
			this.connectionPromise = mongoose
				.connect(getConfig("DB_URL"), {
					serverSelectionTimeoutMS: 10000,
				})
				.then(async (connection) => {
					await this.syncIndexes();
					this.hasConnected = true;
					if (successCallback) {
						await successCallback();
					}
					return connection;
				})
				.catch(async (error: unknown) => {
					this.connectionPromise = undefined;
					this.hasConnected = false;
					if (mongoose.connection.readyState !== 0) {
						await mongoose.disconnect();
					}
					logger.error("DATABASE", "MongoDB connection failed", { error });
					throw error;
				});
		}

		return this.connectionPromise;
	}

	static async disconnect(): Promise<void> {
		this.hasExited = true;
		if (!this.hasConnected || mongoose.connection.readyState === 0) {
			this.connectionPromise = undefined;
			return;
		}

		await mongoose.disconnect();
		this.connectionPromise = undefined;
		this.hasConnected = false;
		logger.info("DATABASE", "MongoDB disconnected");
	}
}

export const connectDatabase = (options?: DatabaseInitOptions) => DatabaseManager.init(options);
export const isDatabaseConnected = (): boolean => DatabaseManager.getDatabaseStatus();
export const disconnectDatabase = (): Promise<void> => DatabaseManager.disconnect();

export default DatabaseManager;
