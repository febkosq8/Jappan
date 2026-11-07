import { PermissionsBitField } from "discord.js";
import { z } from "zod";

import { defineRouter, errorResponseSchema } from "../../helpers/route.js";
import { getCommandId, getGlobalCommands, type BotCommandData } from "../../services/commandLoader.js";

const commandSchema = z.object({
	id: z.string().nullable(),
	type: z.enum(["command", "sub-command"]),
	name: z.string(),
	description: z.string(),
	category: z.enum(["general", "music", "level", "fun", "moderator", "admin"]),
	requiredBotPermissions: z.array(z.string()),
	requiredUserPermissions: z.array(z.string()),
});

export default defineRouter("/commands", [
	{
		method: "get",
		path: "/",
		tags: ["Commands"],
		summary: "List global slash commands and subcommands",
		errorMessage: "Failed to list commands",
		responses: {
			200: {
				description: "Global command descriptions and declared permissions",
				schema: z.array(commandSchema),
			},
			500: { description: "Failed to list commands", schema: errorResponseSchema },
		},
		handler: (_request, response) => {
			const entries: z.infer<typeof commandSchema>[] = [];
			const addEntry = ({
				command,
				id,
				prefix,
				botPermissions,
				userPermissions,
			}: {
				command: BotCommandData;
				id: string | null;
				prefix: string;
				botPermissions: PermissionsBitField;
				userPermissions: PermissionsBitField;
			}): void => {
				const name = prefix ? `${prefix} ${command.name}` : command.name;
				const requiredBotPermissions = new PermissionsBitField(botPermissions.bitfield).add(
					...(command.requiredBotPermissions ?? []),
				);
				const requiredUserPermissions = new PermissionsBitField(userPermissions.bitfield).add(
					...(command.defaultMemberPermissions === undefined ? [] : [command.defaultMemberPermissions]),
				);
				entries.push({
					id,
					type: prefix ? "sub-command" : "command",
					name,
					description: command.description,
					category: command.category,
					requiredBotPermissions: requiredBotPermissions.toArray(),
					requiredUserPermissions: requiredUserPermissions.toArray(),
				});
				for (const subcommand of command.subCommands ?? []) {
					addEntry({
						command: subcommand,
						id,
						prefix: name,
						botPermissions: requiredBotPermissions,
						userPermissions: requiredUserPermissions,
					});
				}
			};
			for (const command of getGlobalCommands().values()) {
				addEntry({
					command: command.commandData,
					id: getCommandId(command.commandData.name) ?? null,
					prefix: "",
					botPermissions: new PermissionsBitField(),
					userPermissions: new PermissionsBitField(),
				});
			}
			return response.status(200).json(entries);
		},
	},
]);
