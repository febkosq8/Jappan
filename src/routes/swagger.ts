import { Router, type Router as ExpressRouter } from "express";
import swaggerUi from "swagger-ui-express";

import { getOpenApiDocument } from "../docs/openapi.js";
import { routers } from "./index.js";

export const DOCS_ROUTE = "/swagger";

const router: ExpressRouter = Router();

router.get("/openapi.json", (_request, response) => {
	response.status(200).json(getOpenApiDocument(routers));
});
router.use(
	DOCS_ROUTE,
	swaggerUi.serve,
	swaggerUi.setup(undefined, { customSiteTitle: "API Docs", swaggerOptions: { url: "/openapi.json" } }),
);

export default router;
