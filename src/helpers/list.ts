import type { Response } from "express";
import { z } from "zod";

import type { RouteParameter } from "./route.js";

export const DEFAULT_PER_PAGE_LIMIT = 25;
export const MAX_PER_PAGE_LIMIT = 1000;

export function queryIntegerSchema({ min, max }: { min: number; max: number }) {
	return z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));
}

export const listQuerySchema = z.strictObject({
	page: queryIntegerSchema({ min: 1, max: 1_000_000 })
		.optional()
		.transform((value) => value ?? 1),
	perPageLimit: queryIntegerSchema({ min: 0, max: MAX_PER_PAGE_LIMIT })
		.optional()
		.transform((value) => value ?? DEFAULT_PER_PAGE_LIMIT),
	query: z.string().trim().min(1).optional(),
});

export const queryBooleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const listQueryParameters = [
	{
		name: "page",
		in: "query",
		required: false,
		description: "Page of results to return. Example: page=1",
		schema: z.number().int().min(1).max(1_000_000),
	},
	{
		name: "perPageLimit",
		in: "query",
		required: false,
		description: "Maximum results per page; 0 returns all matching results. Example: perPageLimit=25",
		schema: z.number().int().min(0).max(MAX_PER_PAGE_LIMIT),
	},
	{
		name: "query",
		in: "query",
		required: false,
		description:
			"Case-insensitive substring search across supported fields. Pass the text to find, not a field expression: query=Febkosq8, not query=name=Febkosq8. Combine with other parameters using &.",
		schema: z.string().trim().min(1),
	},
] as const satisfies readonly RouteParameter[];

export interface PaginatedList<T> {
	items: T[];
	pagination: {
		page: number;
		perPageLimit: number;
		total: number;
		totalPages: number;
	};
}

export function paginatedListSchema<T extends z.ZodType>(itemSchema: T) {
	return z.object({
		items: z.array(itemSchema),
		pagination: z.object({
			page: z.number().int().min(1),
			perPageLimit: z.number().int().min(0).max(MAX_PER_PAGE_LIMIT),
			total: z.number().int().nonnegative(),
			totalPages: z.number().int().nonnegative(),
		}),
	});
}

export function parseListQuery<T extends z.ZodObject>(
	query: unknown,
	schema: T,
	response: Response,
): z.output<T> | undefined {
	const parsed = schema.safeParse(query);
	if (!parsed.success) {
		response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid list query" });
		return;
	}
	return parsed.data;
}

export function createPaginatedList<T>({
	items,
	total,
	page,
	perPageLimit,
}: {
	items: T[];
	total: number;
	page: number;
	perPageLimit: number;
}): PaginatedList<T> {
	const resultPage = perPageLimit === 0 ? 1 : page;
	return {
		items,
		pagination: {
			page: resultPage,
			perPageLimit,
			total,
			totalPages: perPageLimit === 0 ? Number(total > 0) : Math.ceil(total / perPageLimit),
		},
	};
}

export function paginateList<T>({
	items,
	page,
	perPageLimit,
}: {
	items: readonly T[];
	page: number;
	perPageLimit: number;
}): PaginatedList<T> {
	if (perPageLimit === 0) {
		return createPaginatedList({ items: [...items], total: items.length, page: 1, perPageLimit });
	}
	const start = (page - 1) * perPageLimit;
	return createPaginatedList({
		items: items.slice(start, start + perPageLimit),
		total: items.length,
		page,
		perPageLimit,
	});
}

export function filterListByQuery<T>({
	items,
	query,
	searchableFields,
}: {
	items: readonly T[];
	query: string | undefined;
	searchableFields: (item: T) => readonly (string | number | boolean | null | undefined)[];
}): T[] {
	if (!query) return [...items];
	const normalizedQuery = query.toLocaleLowerCase();
	return items.filter((item) =>
		searchableFields(item).some((field) =>
			String(field ?? "")
				.toLocaleLowerCase()
				.includes(normalizedQuery),
		),
	);
}
