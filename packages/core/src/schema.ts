/**
 * The only capability the core needs from a schema library. Adapters for Zod,
 * TypeBox, Valibot, or application-specific validators can satisfy this shape
 * without becoming a dependency of the contract model.
 */
export type JsonPrimitive = boolean | null | number | string
export type JsonValue =
  JsonPrimitive | Readonly<{ [key: string]: JsonValue }> | readonly JsonValue[]

export type JsonSchema = Readonly<Record<string, JsonValue>>

export interface SchemaMetadata {
  readonly jsonSchema?: JsonSchema
}

export interface RuntimeSchema<Output> {
  readonly metadata?: SchemaMetadata
  readonly parse: (input: unknown) => Output
}

export type SchemaOutput<Schema> = Schema extends RuntimeSchema<infer Output> ? Output : never

export function defineSchema<Output>(
  parse: (input: unknown) => Output,
  metadata?: SchemaMetadata,
): RuntimeSchema<Output> {
  if (!metadata) return Object.freeze({ parse })
  return Object.freeze({ metadata: Object.freeze({ ...metadata }), parse })
}
