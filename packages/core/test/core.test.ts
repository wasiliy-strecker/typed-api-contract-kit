import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  ContractDefinitionError,
  ContractValueError,
  UndeclaredResponseError,
  defineContract,
  defineOperation,
  defineSchema,
  parseRequest,
  parseResponse,
  type RequestFor,
  type ResponseFor,
} from '../src/index.js'

interface Customer {
  readonly id: string
  readonly name: string
}

interface Problem {
  readonly message: string
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected an object')
  }
  return value as Record<string, unknown>
}

function stringProperty(value: Record<string, unknown>, property: string): string {
  const candidate = value[property]
  if (typeof candidate !== 'string') throw new TypeError(`Expected ${property} to be a string`)
  return candidate
}

const paramsSchema = defineSchema((input): Readonly<{ customerId: string }> => {
  const value = record(input)
  return { customerId: stringProperty(value, 'customerId') }
})

const querySchema = defineSchema((input): Readonly<{ includeHistory: boolean }> => {
  const value = record(input)
  if (typeof value.includeHistory !== 'boolean') {
    throw new TypeError('Expected includeHistory to be a boolean')
  }
  return { includeHistory: value.includeHistory }
})

const customerSchema = defineSchema((input): Customer => {
  const value = record(input)
  return { id: stringProperty(value, 'id'), name: stringProperty(value, 'name') }
})

const problemSchema = defineSchema((input): Problem => {
  const value = record(input)
  return { message: stringProperty(value, 'message') }
})

const getCustomer = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: { params: paramsSchema, query: querySchema },
  responses: { 200: customerSchema, 404: problemSchema },
  summary: 'Load one customer',
})

describe('contract definitions', () => {
  it('preserves operation literals and inferred request and response types', () => {
    const contract = defineContract({
      name: 'customer-api',
      operations: { getCustomer },
      version: '1.0.0',
    })

    expect(contract.name).toBe('customer-api')
    expect(contract.operations.getCustomer.method).toBe('GET')
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.operations)).toBe(true)
    expect(Object.isFrozen(paramsSchema)).toBe(true)
    expect(Object.isFrozen(getCustomer.request)).toBe(true)
    expect(Object.isFrozen(getCustomer.responses)).toBe(true)

    expectTypeOf<RequestFor<typeof getCustomer>>().toEqualTypeOf<
      Readonly<{
        params: Readonly<{ customerId: string }>
        query: Readonly<{ includeHistory: boolean }>
      }>
    >()
    expectTypeOf<ResponseFor<typeof getCustomer>>().toEqualTypeOf<
      Readonly<{ status: 200; body: Customer }> | Readonly<{ status: 404; body: Problem }>
    >()
  })

  it.each([
    ['', '1.0.0', 'EMPTY_CONTRACT_NAME'],
    ['customer-api', '', 'EMPTY_CONTRACT_VERSION'],
  ] as const)('rejects invalid contract metadata', (name, version, code) => {
    expect(() => defineContract({ name, operations: { getCustomer }, version })).toThrowError(
      expect.objectContaining({ code }),
    )
  })

  it('requires at least one operation with a non-empty ID', () => {
    expect(() =>
      defineContract({ name: 'customer-api', operations: {}, version: '1.0.0' }),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_OPERATION' }))

    expect(() =>
      defineContract({
        name: 'customer-api',
        operations: { ' ': getCustomer },
        version: '1.0.0',
      }),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_OPERATION_ID' }))
  })

  it('rejects duplicate method and path pairs under different operation IDs', () => {
    expect(() =>
      defineContract({
        name: 'customer-api',
        operations: { findCustomer: getCustomer, getCustomer },
        version: '1.0.0',
      }),
    ).toThrowError(
      new ContractDefinitionError(
        'DUPLICATE_OPERATION',
        'Operations findCustomer and getCustomer both declare GET /customers/:customerId',
      ),
    )
  })

  it.each(['/customers?active=true', '/customers#active', 'customers'])(
    'rejects the invalid operation path %s',
    (path) => {
      expect(() =>
        defineOperation({
          method: 'GET',
          path,
          request: {},
          responses: { 200: customerSchema },
        }),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_PATH' }))
    },
  )

  it('requires at least one declared response', () => {
    expect(() =>
      defineOperation({ method: 'GET', path: '/customers', request: {}, responses: {} }),
    ).toThrowError(expect.objectContaining({ code: 'MISSING_RESPONSE' }))
  })

  it.each([99, 200.5, 600])('rejects invalid response status %s', (status) => {
    expect(() =>
      defineOperation({
        method: 'GET',
        path: '/customers',
        request: {},
        responses: { [status]: customerSchema },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RESPONSE_STATUS' }))
  })
})

describe('runtime parsing', () => {
  it('parses only the request locations declared by the operation', () => {
    const request = parseRequest('getCustomer', getCustomer, {
      body: { ignored: true },
      params: { customerId: 'customer-42' },
      query: { includeHistory: true },
    })

    expect(request).toEqual({
      params: { customerId: 'customer-42' },
      query: { includeHistory: true },
    })
  })

  it('adds operation and location context to request validation failures', () => {
    const cause = new TypeError('Expected customerId to be a string')

    try {
      parseRequest('getCustomer', getCustomer, {
        params: { customerId: 42 },
        query: { includeHistory: true },
      })
      expect.unreachable('Expected request parsing to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValueError)
      expect(error).toMatchObject({
        cause,
        location: 'params',
        message: 'Validation failed for getCustomer params',
        operationId: 'getCustomer',
        status: undefined,
      })
    }
  })

  it('returns a status-discriminated validated response', () => {
    const response = parseResponse('getCustomer', getCustomer, 200, {
      id: 'customer-42',
      name: 'Ada',
    })

    expect(response).toEqual({
      body: { id: 'customer-42', name: 'Ada' },
      status: 200,
    })
  })

  it('adds status context to response validation failures', () => {
    expect(() => parseResponse('getCustomer', getCustomer, 404, {})).toThrowError(
      expect.objectContaining({
        location: 'response',
        message: 'Validation failed for getCustomer response 404',
        operationId: 'getCustomer',
        status: 404,
      }),
    )
  })

  it('rejects response statuses missing from the contract', () => {
    expect(() => parseResponse('getCustomer', getCustomer, 500, {})).toThrowError(
      new UndeclaredResponseError('getCustomer', 500),
    )
  })
})
