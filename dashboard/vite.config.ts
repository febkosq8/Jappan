import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist",
	},
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		port: 3000,
	},
	plugins: [react()],
});
