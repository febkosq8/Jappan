import type { RouterDefinition } from "../helpers/route.js";
import base from "./base.js";
import health from "./health.js";

export const routers: RouterDefinition[] = [health, base];
