import { Router, type Router as ExpressRouter } from "express";
import swaggerUi from "swagger-ui-express";

export const DOCS_ROUTE = "/swagger";

const router: ExpressRouter = Router();

router.use(
	DOCS_ROUTE,
	swaggerUi.serve,
	swaggerUi.setup(undefined, { customSiteTitle: "API Docs", swaggerOptions: { url: "/openapi.json" } }),
);

export default router;
