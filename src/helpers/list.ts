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

const listFieldFilterSchema = z.record(z.string(), z.string().trim().min(1));

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
			"Global case-insensitive substring search across searchable fields. A field filter overrides this query.",
		schema: z.string().trim().min(1),
	},
	{
		name: "filter",
		in: "query",
		required: false,
		description:
			"Field-specific case-insensitive substring filters, e.g. filter[name]=Febkosq8. If present, these override query; multiple filters are combined with AND.",
		schema: listFieldFilterSchema,
		style: "deepObject",
		explode: true,
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
): (z.output<T> & { fieldFilters: Record<string, string> }) | undefined {
	if (typeof query !== "object" || query === null || Array.isArray(query)) {
		response.status(400).json({ error: "Invalid list query" });
		return;
	}

	const queryParameters = query as Record<string, unknown>;
	const parsedParameters: Record<string, unknown> = {};
	const fieldFilters: Record<string, string> = {};
	const addFieldFilter = (field: string, value: unknown): boolean => {
		if (!/^[A-Za-z][A-Za-z\d_.-]*$/u.test(field)) {
			response.status(400).json({ error: `Invalid list filter field: ${field}` });
			return false;
		}
		if (typeof value !== "string" || value.trim().length === 0) {
			response.status(400).json({ error: `Invalid list filter value for field: ${field}` });
			return false;
		}
		if (Object.hasOwn(fieldFilters, field)) {
			response.status(400).json({ error: `Duplicate list filter field: ${field}` });
			return false;
		}
		fieldFilters[field] = value.trim();
		return true;
	};

	for (const [key, value] of Object.entries(queryParameters)) {
		if (key === "filter") {
			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				response.status(400).json({ error: "List filter must be an object" });
				return;
			}
			for (const [field, fieldValue] of Object.entries(value)) {
				if (!addFieldFilter(field, fieldValue)) return;
			}
			continue;
		}

		if (key.startsWith("filter[")) {
			const match = /^filter\[([^\]]+)\]$/u.exec(key);
			if (!match) {
				response.status(400).json({ error: `Invalid list filter parameter: ${key}` });
				return;
			}
			const field = match[1];
			if (!field || !addFieldFilter(field, value)) return;
			continue;
		}

		parsedParameters[key] = value;
	}

	const parsed = schema.safeParse(parsedParameters);
	if (!parsed.success) {
		response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid list query" });
		return;
	}
	return { ...parsed.data, fieldFilters };
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
	fieldFilters,
	searchableFields,
	response,
}: {
	items: readonly T[];
	query: string | undefined;
	fieldFilters: Readonly<Record<string, string>>;
	searchableFields: Readonly<Record<string, (item: T) => string | number | boolean | null | undefined>>;
	response: Response;
}): T[] | undefined {
	const selectors = new Map(Object.entries(searchableFields));
	const fieldNames = [...selectors.keys()];
	if (!validateListFieldFilters({ fieldFilters, fields: fieldNames, response })) return;

	const matches = (value: string | number | boolean | null | undefined, search: string) =>
		String(value ?? "")
			.toLocaleLowerCase()
			.includes(search.toLocaleLowerCase());
	const filters = Object.entries(fieldFilters);
	if (filters.length > 0) {
		const fieldMatches = filters.map(([field, value]) => {
			const select = selectors.get(field);
			if (!select) throw new Error(`Unsupported list filter field: ${field}`);
			return (item: T) => matches(select(item), value);
		});
		return items.filter((item) => fieldMatches.every((fieldMatch) => fieldMatch(item)));
	}
	if (!query) return [...items];
	return items.filter((item) => [...selectors.values()].some((select) => matches(select(item), query)));
}

export function validateListFieldFilters({
	fieldFilters,
	fields,
	response,
}: {
	fieldFilters: Readonly<Record<string, string>>;
	fields: readonly string[];
	response: Response;
}): boolean {
	const unsupportedField = Object.keys(fieldFilters).find((field) => !fields.includes(field));
	if (unsupportedField) {
		response.status(400).json({ error: `Unsupported list filter field: ${unsupportedField}` });
		return false;
	}
	return true;
}
