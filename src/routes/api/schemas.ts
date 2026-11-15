import { z } from "zod";

export const apiUserSchema = z.object({
	id: z.string(),
	displayName: z.string(),
	username: z.string(),
	avatarUrl: z.string().url().nullable(),
});
