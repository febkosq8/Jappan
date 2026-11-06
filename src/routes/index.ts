import type { RouterDefinition } from "../helpers/route.js";
import type { OpenApiOptions } from "../docs/openapi.js";
import base from "./base.js";
import publicRoutes from "./public/index.js";

export const routers: RouterDefinition[] = [publicRoutes, base];
export const openApiOptions: OpenApiOptions = {};
