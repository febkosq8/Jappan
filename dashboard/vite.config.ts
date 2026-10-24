import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	publicDir: "public",
	server: {
		port: 3000,
	},
	build: {
		outDir: "build",
	},
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: {
			"@jappan": "/src",
		},
	},
	plugins: [react(), tailwindcss()],
});
