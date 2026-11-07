import { defineRouter } from "../../../helpers/route.js";
import guildRoutes from "./guilds/index.js";

export default defineRouter("/admin", [guildRoutes]);
