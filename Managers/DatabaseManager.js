const mongoose = require("mongoose");
const fs = require("fs");
const EventHandler = require("../Components/EventHandler");
require("dotenv").config();
let disconnectTimeout = setTimeout(async () => {
	EventHandler.auditEvent("ERROR", "MongoDB instance has not connected : " + mongoose.connection.readyState);
}, 10000);
class DatabaseManager {
	static async init() {
		let dbURL = process.env.DB_URL;
		mongoose.connect(dbURL).catch((error) => {
			console.log("ERROR : Failed to connect to MongoDB instance");
			console.log(error);
		});
		mongoose.connection.on("open", () => {
			clearTimeout(disconnectTimeout);
			EventHandler.auditEvent("LOG", "Successfully connected to MongoDB instance : " + mongoose.connection.readyState);
		});
		mongoose.connection.on("disconnected", () => {
			disconnectTimeout = setTimeout(async () => {
				let error = new Error("NO INFO ON DISCONNECTION");
				EventHandler.auditEvent(
					"ERROR",
					"MongoDB instance has disconnected : " + mongoose.connection.readyState,
					error,
				);
			}, 60000);
		});
	}
	static async backupMongo() {
		const collections = await mongoose.connection.db.collections();
		for (let collection of collections) {
			let { collectionName } = collection;
			let documents = JSON.stringify(await collection.find().toArray());
			fs.writeFileSync("./assets/Backup/MongoDB/" + collectionName + "_" + Date.now() + ".json", documents);
		}
		return true;
	}
	catch(error) {
		EventHandler.auditEvent("ERROR", "Failed to backup MongoDB", error);
		return false;
	}
}
module.exports = DatabaseManager;
