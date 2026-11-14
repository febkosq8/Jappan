import type { Response } from "express";
import { z } from "zod";

import type { RouteParameter } from "./route.js";

export const DEFAULT_PER_PAGE_LIMIT = 25;
export const MAX_PER_PAGE_LIMIT = 1000;

type ListFilterFieldType = "boolean" | "number";
type AnyZodSchema = z.core.$ZodType;

function unwrapSchema(schema: AnyZodSchema): AnyZodSchema {
	if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
		return unwrapSchema(schema.unwrap());
	}
	return schema;
}

function getPropertySchemas(schema: AnyZodSchema, property: string): AnyZodSchema[] {
	const unwrappedSchema = unwrapSchema(schema);
	if (unwrappedSchema instanceof z.ZodArray) {
		return getPropertySchemas(unwrappedSchema.element, property);
	}
	if (unwrappedSchema instanceof z.ZodUnion) {
		return unwrappedSchema.options.flatMap((option) => getPropertySchemas(option, property));
	}
	if (unwrappedSchema instanceof z.ZodObject) {
		const propertySchema = unwrappedSchema.shape[property];
		return propertySchema ? [propertySchema] : [];
	}
	return [];
}

function getSchemaValueTypes(schema: AnyZodSchema): Array<ListFilterFieldType | "other"> {
	const unwrappedSchema = unwrapSchema(schema);
	if (unwrappedSchema instanceof z.ZodArray) {
		return getSchemaValueTypes(unwrappedSchema.element);
	}
	if (unwrappedSchema instanceof z.ZodUnion) {
		return unwrappedSchema.options.flatMap(getSchemaValueTypes);
	}
	if (unwrappedSchema instanceof z.ZodObject) return [];
	if (unwrappedSchema instanceof z.ZodBoolean) return ["boolean"];
	if (unwrappedSchema instanceof z.ZodNumber) return ["number"];
	return ["other"];
}

function getFieldSchemas(schema: AnyZodSchema, field: string): AnyZodSchema[] {
	return field
		.split(".")
		.reduce<AnyZodSchema[]>(
			(schemas, property) => schemas.flatMap((currentSchema) => getPropertySchemas(currentSchema, property)),
			[schema],
		);
}

function getFilterFieldType(schema: AnyZodSchema, field: string): ListFilterFieldType | undefined {
	const fieldSchemas = getFieldSchemas(schema, field);
	const valueTypes = new Set(fieldSchemas.flatMap(getSchemaValueTypes));
	if (valueTypes.size !== 1) return;
	const [valueType] = valueTypes;
	return valueType === "boolean" || valueType === "number" ? valueType : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSchemaValues(value: unknown, schema: AnyZodSchema): Array<string | number | boolean> {
	if (value === null || value === undefined) return [];
	const unwrappedSchema = unwrapSchema(schema);
	if (unwrappedSchema instanceof z.ZodArray) {
		return Array.isArray(value)
			? value.flatMap((entry) => collectSchemaValues(entry, unwrappedSchema.element))
			: [];
	}
	if (unwrappedSchema instanceof z.ZodUnion) {
		return unwrappedSchema.options.flatMap((option) => collectSchemaValues(value, option));
	}
	if (unwrappedSchema instanceof z.ZodObject) {
		if (!isRecord(value)) return [];
		return Object.entries(unwrappedSchema.shape).flatMap(([property, propertySchema]) =>
			collectSchemaValues(value[property], propertySchema),
		);
	}
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? [value] : [];
}

function getFieldValues(
	value: unknown,
	schema: AnyZodSchema,
	path: readonly string[],
): Array<string | number | boolean> {
	if (value === null || value === undefined) return [];
	const unwrappedSchema = unwrapSchema(schema);
	if (unwrappedSchema instanceof z.ZodArray) {
		return Array.isArray(value)
			? value.flatMap((entry) => getFieldValues(entry, unwrappedSchema.element, path))
			: [];
	}
	if (unwrappedSchema instanceof z.ZodUnion) {
		return unwrappedSchema.options.flatMap((option) => getFieldValues(value, option, path));
	}
	if (path.length === 0) return collectSchemaValues(value, unwrappedSchema);
	if (!isRecord(value) || !(unwrappedSchema instanceof z.ZodObject)) return [];
	const [property, ...remainingPath] = path;
	if (!property) return [];
	const propertySchema = unwrappedSchema.shape[property];
	if (!propertySchema) return [];
	return getFieldValues(value[property], propertySchema, remainingPath);
}

function getFilterFieldPaths(schema: AnyZodSchema, prefix = "", paths = new Set<string>()): Set<string> {
	const unwrappedSchema = unwrapSchema(schema);
	if (unwrappedSchema instanceof z.ZodArray) {
		return getFilterFieldPaths(unwrappedSchema.element, prefix, paths);
	}
	if (unwrappedSchema instanceof z.ZodUnion) {
		for (const option of unwrappedSchema.options) {
			getFilterFieldPaths(option, prefix, paths);
		}
		return paths;
	}
	if (unwrappedSchema instanceof z.ZodObject) {
		for (const [property, propertySchema] of Object.entries(unwrappedSchema.shape)) {
			getFilterFieldPaths(propertySchema, prefix ? `${prefix}.${property}` : property, paths);
		}
		return paths;
	}
	if (prefix) paths.add(prefix);
	return paths;
}

function getFilterFieldOpenApiSchema(schema: AnyZodSchema, field: string): z.ZodType {
	const types = new Set(getSchemaValueTypesFromField(schema, field));
	const variants: z.ZodType[] = [];
	if (types.has("other")) variants.push(z.string());
	if (types.has("number")) variants.push(z.number());
	if (types.has("boolean")) variants.push(z.boolean());
	const [firstVariant, ...remainingVariants] = variants;
	if (!firstVariant) {
		throw new Error(`List filter field is missing from its response schema: ${field}`);
	}
	return remainingVariants.reduce<z.ZodType>((combined, variant) => z.union([combined, variant]), firstVariant);
}

function createListFilterSchema(schema: AnyZodSchema, fields?: readonly string[]) {
	const fieldPaths = fields ?? [...getFilterFieldPaths(schema)];
	const properties = Object.fromEntries(
		fieldPaths.map((field) => [field, getFilterFieldOpenApiSchema(schema, field).optional()]),
	);
	return z.strictObject(properties);
}

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

export function listQueryParameters(schema: AnyZodSchema, fields?: readonly string[]): RouteParameter[] {
	return [
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
				"Field-specific case-insensitive substring filters, e.g. filter[name]=Febkosq8. Filter fields and value types are defined by the list item schema. If present, filters override query and combine with AND.",
			schema: createListFilterSchema(schema, fields),
			style: "deepObject",
			explode: true,
		},
	];
}

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
	itemSchema,
	response,
}: {
	items: readonly T[];
	query: string | undefined;
	fieldFilters: Readonly<Record<string, string>>;
	itemSchema: AnyZodSchema;
	response: Response;
}): T[] | undefined {
	if (!validateListFieldFilters({ fieldFilters, itemSchema, response })) return;

	const matches = (value: string | number | boolean, search: string) =>
		String(value ?? "")
			.toLocaleLowerCase()
			.includes(search.toLocaleLowerCase());
	const filters = Object.entries(fieldFilters);
	if (filters.length > 0) {
		return items.filter((item) =>
			filters.every(([field, value]) =>
				getFieldValues(item, itemSchema, field.split(".")).some((fieldValue) => matches(fieldValue, value)),
			),
		);
	}
	if (!query) return [...items];
	return items.filter((item) =>
		collectSchemaValues(item, itemSchema).some((fieldValue) => matches(fieldValue, query)),
	);
}

export function validateListFieldFilters({
	fieldFilters,
	fields,
	itemSchema,
	response,
}: {
	fieldFilters: Readonly<Record<string, string>>;
	fields?: readonly string[];
	itemSchema: AnyZodSchema;
	response: Response;
}): boolean {
	const unsupportedField = Object.keys(fieldFilters).find((field) => {
		if (fields && !fields.includes(field)) return true;
		const valueTypes = getSchemaValueTypesFromField(itemSchema, field);
		return valueTypes.length === 0;
	});
	if (unsupportedField) {
		response.status(400).json({ error: `Unsupported list filter field: ${unsupportedField}` });
		return false;
	}
	for (const [field, value] of Object.entries(fieldFilters)) {
		const fieldType = getFilterFieldType(itemSchema, field);
		const isValid =
			fieldType === "boolean"
				? /^(true|false)$/iu.test(value)
				: fieldType === "number"
					? Number.isFinite(Number(value))
					: true;
		if (!isValid) {
			response.status(400).json({ error: `Invalid list filter value for ${field}; expected ${fieldType}` });
			return false;
		}
	}
	return true;
}

function getSchemaValueTypesFromField(schema: AnyZodSchema, field: string): Array<ListFilterFieldType | "other"> {
	return getFieldSchemas(schema, field).flatMap(getSchemaValueTypes);
}
