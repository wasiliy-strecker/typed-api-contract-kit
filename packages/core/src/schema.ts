/**
 * The only capability the core needs from a schema library. Adapters for Zod,
 * TypeBox, Valibot, or application-specific validators can satisfy this shape
 * without becoming a dependency of the contract model.
 */
export interface RuntimeSchema<Output> {
  readonly parse: (input: unknown) => Output
}

export type SchemaOutput<Schema> = Schema extends RuntimeSchema<infer Output> ? Output : never

export function defineSchema<Output>(parse: (input: unknown) => Output): RuntimeSchema<Output> {
  return Object.freeze({ parse })
}
