import express, { Router, type RequestHandler, type Router as ExpressRouter } from "express";
import { resolve } from "node:path";
import swaggerUi from "swagger-ui-express";

import { getConfig } from "../services/config.js";

export const DOCS_ROUTE = "/swagger";

const router: ExpressRouter = Router();
const publicAssets = express.static(resolve(process.cwd(), "public", "swagger"), {
	cacheControl: false,
	index: false,
});
const swaggerAssets = swaggerUi.serveWithOptions({ cacheControl: false });
const setupSwagger: RequestHandler = (request, response, next) => {
	swaggerUi.setup(undefined, {
		customSiteTitle: `${getConfig("BOT_NAME")} - API Docs`,
		customCssUrl: `${DOCS_ROUTE}/swagger-auth.css`,
		customJs: `${DOCS_ROUTE}/swagger-auth.js`,
		swaggerOptions: { url: "/openapi.json", persistAuthorization: true },
	})(request, response, next);
};

router.use(DOCS_ROUTE, publicAssets, swaggerAssets, setupSwagger);

export default router;
