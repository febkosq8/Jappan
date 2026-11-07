import { Router, type RequestHandler, type Router as ExpressRouter } from "express";
import swaggerUi from "swagger-ui-express";

import { getConfig } from "../services/config.js";

export const DOCS_ROUTE = "/swagger";

const router: ExpressRouter = Router();
const setupSwagger: RequestHandler = (request, response, next) => {
	swaggerUi.setup(undefined, {
		customSiteTitle: `${getConfig("BOT_NAME")} - API Docs`,
		swaggerOptions: { url: "/openapi.json" },
	})(request, response, next);
};

router.use(DOCS_ROUTE, swaggerUi.serve, setupSwagger);

export default router;
