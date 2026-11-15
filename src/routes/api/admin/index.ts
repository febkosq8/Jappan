import { defineRouter } from "../../../helpers/route.js";
import botRoutes from "./bot/index.js";
import guildRoutes from "./guilds/index.js";
import directMessageRoutes from "./directMessages.js";

export default defineRouter("/admin", [botRoutes, guildRoutes, directMessageRoutes]);
