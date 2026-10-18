module.exports = {
	apps: [
		{
			name: "Jappan",
			cwd: __dirname,
			script: "./dist/index.js",
			exec_mode: "fork",
			instances: 1,
			watch: false,
			ignore_watch: ["node_modules", "logs"],
			autorestart: true,
			max_restarts: 10,
			min_uptime: "5s",
			listen_timeout: 10000,
			kill_timeout: 5000,
			restart_delay: 5000,
			exp_backoff_restart_delay: 2000,
			time: true,
			log_date_format: "DD-MM-YYYY HH:mm:ss",
			log_file: "./logs/pm2.log",
			combine_logs: true,
			env: {
				NODE_ENV: "production",
			},
		},
	],
};
