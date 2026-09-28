import { defineConfig } from "@extractorpack/extractorpack";

export default defineConfig({
	"discord-player-youtubei": {
		...(process.env.YT_TOKEN ? { cookie: process.env.YT_TOKEN } : {}),
	},
});
