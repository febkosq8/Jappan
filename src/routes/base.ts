import { getOpenApiDocument } from "../docs/openapi.js";
import { defineRouter } from "../helpers/route.js";
import { getConfig } from "../services/config.js";
import { openApiOptions, routers } from "./index.js";

export default defineRouter("/", [
	{
		method: "get",
		path: "/openapi.json",
		tags: ["Base"],
		excludeFromOpenApi: true,
		summary: "OpenAPI specification",
		errorMessage: "Something went wrong while returning the OpenAPI specification",
		responses: { 200: { description: "OpenAPI specification document" } },
		handler: (_request, response) => {
			return response.status(200).json(getOpenApiDocument(routers, openApiOptions));
		},
	},
	{
		method: "get",
		path: "/",
		tags: ["Base"],
		excludeFromOpenApi: true,
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
