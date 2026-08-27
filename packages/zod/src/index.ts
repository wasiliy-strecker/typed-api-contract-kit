import { defineSchema, type JsonSchema, type RuntimeSchema } from '@typed-api-contract-kit/core'
import * as z from 'zod'

export interface ZodSchemaAdapterOptions {
  /**
   * Disable metadata generation for schemas that JSON Schema cannot represent,
   * such as transforms. Runtime parsing remains available.
   */
  readonly includeJsonSchema?: boolean
  /** Select whether metadata describes the schema's accepted input or parsed output. */
  readonly io?: 'input' | 'output'
}

export function fromZod<Schema extends z.ZodType>(
  schema: Schema,
  options: ZodSchemaAdapterOptions = {},
): RuntimeSchema<z.output<Schema>> {
  const parse = (input: unknown): z.output<Schema> => schema.parse(input)
  if (options.includeJsonSchema === false) return defineSchema(parse)

  const jsonSchema = z.toJSONSchema(schema, {
    io: options.io ?? 'output',
    target: 'draft-2020-12',
  })
  return defineSchema(parse, { jsonSchema: jsonSchema as JsonSchema })
}
