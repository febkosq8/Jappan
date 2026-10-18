import { defineRouter } from "../helpers/route.js";
import { getConfig } from "../services/config.js";

export default defineRouter("/", [
	{
		method: "get",
		path: "/",
		tags: ["Base"],
		hidden: true,
		summary: "Redirect to the bot website",
		errorMessage: "Something went wrong while redirecting to homepage",
		responses: {
			307: { description: "Redirect to the bot website", headers: { Location: "Bot website URL" } },
		},
		handler: (_request, response) => {
			const address = getConfig("BOT_WEBSITE");
			return response.header("Location", address).status(307).send(`Redirecting to '${address}'`);
		},
	},
]);
