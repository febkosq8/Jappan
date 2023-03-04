const getRootPath = (fileName, global, guild, test) => {
	const fileMap = {
		global: global.map((command) => command.name),
		guild: guild.map((command) => command.name),
		test: test.map((command) => command.name),
	};
	let filePath = "";
	Object.entries(fileMap).forEach(([key, value]) => {
		if (value.includes(fileName)) return (filePath = `./slashCommands/${key}`);
	});
	if (filePath === "") return;
	return filePath;
};
module.exports = {
	getRootPath,
};
