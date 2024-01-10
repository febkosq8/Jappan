let errorCount = 0;
const Discord = require("discord.js");
const ClientConfig = require("./client/Client");
const client = new ClientConfig();
client.commands = new Discord.Collection();
var pjson = require("./package.json");
require("dotenv").config();

//Handlers
const indexPost = require("./indexPost");
const EventHandler = require("./Components/EventHandler");
const ClientHandler = require("./Components/ClientHandler");
ClientHandler.setClient(client);

//Bot Config
const config = require("./config.json");
var token = ClientHandler.getToken();

client.login(token).then(() => {
	EventHandler.auditEvent(
		"LOG",
		"Connected to Discord servers using " +
			(token ? "token" : "config token") +
			" with Bot Mode : " +
			process.env.botMode,
	);
});

client.on("ready", function (readyClient) {
	EventHandler.auditEvent("LOG", "Bot @ v" + pjson.version + " is now ready to recieve requests");
	client.user.setPresence({
		activities: [
			{
				name: config.activity,
				type: config.activityType,
			},
		],
		status: config.status,
	});
	indexPost.init(readyClient);
});

client.on("reconnecting", () => {
	EventHandler.auditEvent("INFO", "Reconnecting");
});

client.on("disconnect", () => {
	EventHandler.auditEvent("INFO", "Disconnect");
});

process.on("uncaughtException", function (error) {
	errorCount++;
	EventHandler.auditEvent(
		"ERROR",
		"Caught a Exception (Current Count : " + errorCount + ") that was not handled properly",
		error,
	);
	if (errorCount > 5) {
		EventHandler.auditEvent("ERROR", "5 Uncaught Exceptions have occured, exiting process in 5 seconds");
		setInterval(() => {
			process.exit(1);
		}, 5000);
	}
});

process.on("unhandledRejection", (error) => {
	EventHandler.auditEvent("ERROR", "Caught a unhandled rejection", error);
});

process.on("SIGTERM", (signal) => {
	EventHandler.auditEvent("LOG", "Bot process " + `${process.pid}` + " has received a SIGTERM signal");
	process.exit(0);
});
