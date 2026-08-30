import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ContractValueError,
  UndeclaredResponseError,
  defineOperation,
  defineSchema,
} from '@typed-api-contract-kit/core'

import { executeFetchOperation, type FetchLike } from '../src/index.js'

const customerSchema = defineSchema((input): { readonly id: string; readonly name: string } => {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('id' in input) ||
    typeof input.id !== 'string' ||
    !('name' in input) ||
    typeof input.name !== 'string'
  ) {
    throw new TypeError('Expected customer')
  }
  return { id: input.id, name: input.name }
})

const problemSchema = defineSchema((input): { readonly message: string } => {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('message' in input) ||
    typeof input.message !== 'string'
  ) {
    throw new TypeError('Expected problem')
  }
  return { message: input.message }
})

const getCustomer = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: {
    headers: defineSchema(
      (
        _input,
      ): {
        readonly authorization: string
        readonly 'x-attempt': readonly number[]
      } => ({ authorization: 'Bearer token', 'x-attempt': [1, 2] }),
    ),
    params: defineSchema((_input): { readonly customerId: string } => ({
      customerId: 'customer-42',
    })),
    query: defineSchema(
      (
        _input,
      ): {
        readonly cursor: bigint
        readonly empty?: undefined
        readonly includeHistory: boolean
        readonly nullable: null
        readonly page: number
        readonly tags: readonly string[]
      } => ({
        cursor: 3n,
        includeHistory: true,
        nullable: null,
        page: 2,
        tags: ['priority', 'new'],
      }),
    ),
  },
  responses: {
    200: customerSchema,
    404: problemSchema,
  },
})

const createCustomer = defineOperation({
  method: 'POST',
  path: '/customers',
  request: {
    body: defineSchema((_input): { readonly name: string } => ({ name: 'Ada' })),
  },
  responses: { 201: customerSchema },
})

function jsonResponse(body: unknown, status: number, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': contentType }, status })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('executeFetchOperation', () => {
  it('serializes path, query, headers, and cancellation while preserving a base path', async () => {
    const controller = new AbortController()
    let capturedInput: string | URL | undefined
    let capturedInit: RequestInit | undefined
    const fetch: FetchLike = (input, init) => {
      capturedInput = input
      capturedInit = init
      return Promise.resolve(jsonResponse({ id: 'customer/42', name: 'Ada' }, 200))
    }

    const response = await executeFetchOperation({
      baseUrl: new URL('https://api.example.test/v1'),
      fetch,
      operation: getCustomer,
      operationId: 'getCustomer',
      request: {
        headers: { authorization: 'Bearer secret', 'x-attempt': [1, 2] },
        params: { customerId: 'customer/42' },
        query: {
          cursor: 3n,
          empty: undefined,
          includeHistory: true,
          nullable: null,
          page: 2,
          tags: ['priority', 'new'],
        },
      },
      signal: controller.signal,
    })

    const url = new URL(String(capturedInput))
    const headers = new Headers(capturedInit?.headers)
    expect(url.pathname).toBe('/v1/customers/customer%2F42')
    expect(url.searchParams.get('cursor')).toBe('3')
    expect(url.searchParams.get('includeHistory')).toBe('true')
    expect(url.searchParams.get('nullable')).toBe('null')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.getAll('tags')).toEqual(['priority', 'new'])
    expect(url.searchParams.has('empty')).toBe(false)
    expect(headers.get('authorization')).toBe('Bearer secret')
    expect(headers.get('x-attempt')).toBe('1, 2')
    expect(capturedInit?.method).toBe('GET')
    expect(capturedInit?.signal).toBe(controller.signal)
    expect(response).toEqual({ body: { id: 'customer/42', name: 'Ada' }, status: 200 })
  })

  it('serializes JSON bodies and supplies the default global fetch implementation', async () => {
    let capturedInit: RequestInit | undefined
    vi.stubGlobal('fetch', (_input: string | URL, init?: RequestInit) => {
      capturedInit = init
      return Promise.resolve(jsonResponse({ id: 'customer-42', name: 'Grace' }, 201))
    })

    await executeFetchOperation({
      baseUrl: 'https://api.example.test',
      operation: createCustomer,
      operationId: 'createCustomer',
      request: { body: { name: 'Grace' } },
    })

    const headers = new Headers(capturedInit?.headers)
    expect(capturedInit?.body).toBe('{"name":"Grace"}')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('preserves an explicitly declared content type for a request body', async () => {
    const operation = defineOperation({
      method: 'POST',
      path: '/customers/import',
      request: {
        body: defineSchema((_input): { readonly name: string } => ({ name: 'Ada' })),
        headers: defineSchema((_input): { readonly 'content-type': string } => ({
          'content-type': 'application/vnd.customer+json',
        })),
      },
      responses: { 201: customerSchema },
    })
    let capturedInit: RequestInit | undefined

    await executeFetchOperation({
      baseUrl: 'https://api.example.test',
      fetch: (_input, init) => {
        capturedInit = init
        return Promise.resolve(jsonResponse({ id: 'customer-42', name: 'Ada' }, 201))
      },
      operation,
      operationId: 'importCustomer',
      request: {
        body: { name: 'Ada' },
        headers: { 'content-type': 'application/vnd.customer+json' },
      },
    })

    expect(new Headers(capturedInit?.headers).get('content-type')).toBe(
      'application/vnd.customer+json',
    )
  })

  it('returns declared non-success responses as a typed status union', async () => {
    const response = await executeFetchOperation({
      baseUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          jsonResponse({ message: 'Customer not found' }, 404, 'application/problem+json'),
        ),
      operation: getCustomer,
      operationId: 'getCustomer',
      request: {
        headers: { authorization: 'Bearer secret', 'x-attempt': [] },
        params: { customerId: 'missing' },
        query: {
          cursor: 0n,
          includeHistory: false,
          nullable: null,
          page: 1,
          tags: [],
        },
      },
    })

    expect(response).toEqual({ body: { message: 'Customer not found' }, status: 404 })
  })

  it('decodes text and empty response bodies', async () => {
    const textOperation = defineOperation({
      method: 'GET',
      path: '/health/12:30',
      request: {},
      responses: { 200: defineSchema((input): string => String(input)) },
    })
    const emptyOperation = defineOperation({
      method: 'GET',
      path: '/empty',
      request: {},
      responses: { 200: defineSchema((input): undefined => input as undefined) },
    })

    const text = await executeFetchOperation({
      baseUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response('healthy', { status: 200 })),
      operation: textOperation,
      operationId: 'health',
      request: {},
    })
    const empty = await executeFetchOperation({
      baseUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response('', { status: 200 })),
      operation: emptyOperation,
      operationId: 'empty',
      request: {},
    })

    expect(text).toEqual({ body: 'healthy', status: 200 })
    expect(empty).toEqual({ body: undefined, status: 200 })
  })

  it.each([204, 205] as const)('does not read a body for status %s', async (status) => {
    const operation = defineOperation({
      method: 'DELETE',
      path: '/customers/:customerId',
      request: {
        params: defineSchema((_input): { readonly customerId: string } => ({
          customerId: 'customer-42',
        })),
      },
      responses: { [status]: defineSchema((input): undefined => input as undefined) },
    })

    const response = await executeFetchOperation({
      baseUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response(null, { status })),
      operation,
      operationId: 'deleteCustomer',
      request: { params: { customerId: 'customer-42' } },
    })

    expect(response).toEqual({ body: undefined, status })
  })

  it('rejects response bodies that violate the operation contract', async () => {
    await expect(
      executeFetchOperation({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(jsonResponse({ id: 42, name: null }, 200)),
        operation: getCustomer,
        operationId: 'getCustomer',
        request: {
          headers: { authorization: 'Bearer secret', 'x-attempt': [] },
          params: { customerId: 'customer-42' },
          query: {
            cursor: 0n,
            includeHistory: false,
            nullable: null,
            page: 1,
            tags: [],
          },
        },
      }),
    ).rejects.toBeInstanceOf(ContractValueError)
  })

  it('rejects response statuses that are absent from the operation contract', async () => {
    await expect(
      executeFetchOperation({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(jsonResponse({ message: 'Unavailable' }, 503)),
        operation: createCustomer,
        operationId: 'createCustomer',
        request: { body: { name: 'Grace' } },
      }),
    ).rejects.toBeInstanceOf(UndeclaredResponseError)
  })

  it('rejects missing path parameters and unsupported query values', async () => {
    await expect(
      executeFetchOperation({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(jsonResponse({ message: 'unused' }, 404)),
        operation: getCustomer,
        operationId: 'getCustomer',
        request: { params: {} } as never,
      }),
    ).rejects.toThrow('Fetch path parameter customerId must be a string')

    await expect(
      executeFetchOperation({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(jsonResponse({ message: 'unused' }, 404)),
        operation: getCustomer,
        operationId: 'getCustomer',
        request: {
          headers: { authorization: 'Bearer secret', 'x-attempt': [] },
          params: { customerId: 'customer-42' },
          query: { nested: { unsupported: true } },
        } as never,
      }),
    ).rejects.toThrow('Fetch query values must be primitive')
  })

  it('rejects non-object request locations and non-serializable bodies', async () => {
    await expect(
      executeFetchOperation({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(jsonResponse({ message: 'unused' }, 404)),
        operation: getCustomer,
        operationId: 'getCustomer',
        request: { params: [] } as never,
      }),
    ).rejects.toThrow('Fetch params must be an object')

    const undefinedBodyOperation = defineOperation({
      method: 'POST',
      path: '/undefined',
      request: { body: defineSchema((_input): undefined => undefined) },
      responses: { 204: defineSchema((input): undefined => input as undefined) },
    })
    await expect(
      executeFetchOperation({
        baseUrl: 'https://api.example.test',
        fetch: () => Promise.resolve(new Response(null, { status: 204 })),
        operation: undefinedBodyOperation,
        operationId: 'undefinedBody',
        request: { body: undefined },
      }),
    ).rejects.toThrow('Fetch body must be JSON serializable')
  })
})
