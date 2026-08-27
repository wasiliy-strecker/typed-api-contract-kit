import { describe, expect, expectTypeOf, it } from 'vitest'
import * as z from 'zod'

import {
  ContractValueError,
  defineOperation,
  parseRequest,
  type SchemaOutput,
} from '@typed-api-contract-kit/core'

import { fromZod } from '../src/index.js'

describe('fromZod', () => {
  it('preserves parsed output types and emits draft 2020-12 metadata', () => {
    const customer = fromZod(
      z.object({
        id: z.uuid(),
        name: z.string().min(1),
        nickname: z.string().optional(),
        profile: z.object({ active: z.boolean() }),
        role: z.enum(['admin', 'member']),
      }),
    )

    const parsed = customer.parse({
      id: 'f18c452a-1b77-4db9-b06b-957aee64d417',
      name: 'Ada',
      profile: { active: true },
      role: 'admin',
    })

    expect(parsed).toEqual({
      id: 'f18c452a-1b77-4db9-b06b-957aee64d417',
      name: 'Ada',
      profile: { active: true },
      role: 'admin',
    })
    expectTypeOf<SchemaOutput<typeof customer>>().toEqualTypeOf<{
      id: string
      name: string
      nickname?: string
      profile: { active: boolean }
      role: 'admin' | 'member'
    }>()
    expect(customer.metadata?.jsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
      properties: {
        id: { format: 'uuid', type: 'string' },
        name: { minLength: 1, type: 'string' },
        nickname: { type: 'string' },
        profile: {
          additionalProperties: false,
          properties: { active: { type: 'boolean' } },
          required: ['active'],
          type: 'object',
        },
        role: { enum: ['admin', 'member'], type: 'string' },
      },
      required: ['id', 'name', 'profile', 'role'],
      type: 'object',
    })
  })

  it('can describe accepted input separately from parsed output', () => {
    const pagination = z.object({ limit: z.number().int().default(20) })
    const inputSchema = fromZod(pagination, { io: 'input' })
    const outputSchema = fromZod(pagination, { io: 'output' })

    expect(inputSchema.metadata?.jsonSchema).not.toHaveProperty('required')
    expect(outputSchema.metadata?.jsonSchema).toHaveProperty('required', ['limit'])
    expect(inputSchema.parse({})).toEqual({ limit: 20 })
  })

  it('supports runtime-only transforms when metadata is explicitly disabled', () => {
    const transformed = fromZod(
      z.string().transform((value) => value.length),
      {
        includeJsonSchema: false,
      },
    )

    expect(transformed.metadata).toBeUndefined()
    expect(transformed.parse('contract')).toBe(8)
    expectTypeOf<SchemaOutput<typeof transformed>>().toEqualTypeOf<number>()
  })

  it('keeps Zod failures as the cause of contract-level validation errors', () => {
    const operation = defineOperation({
      method: 'GET',
      path: '/customers/:customerId',
      request: { params: fromZod(z.object({ customerId: z.uuid() })) },
      responses: { 204: fromZod(z.undefined(), { includeJsonSchema: false }) },
    })

    try {
      parseRequest('getCustomer', operation, { params: { customerId: 'not-a-uuid' } })
      expect.unreachable('Expected request parsing to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValueError)
      expect(error).toMatchObject({ location: 'params', operationId: 'getCustomer' })
      expect((error as ContractValueError).cause).toBeInstanceOf(z.ZodError)
    }
  })
})
