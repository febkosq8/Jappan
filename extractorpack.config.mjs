import { defineConfig } from "@extractorpack/extractorpack";

export default defineConfig({
	"discord-player-youtubei": {
		...(process.env.PLAYER_TOKEN_YOUTUBE ? { cookie: process.env.PLAYER_TOKEN_YOUTUBE } : {}),
	},
});
