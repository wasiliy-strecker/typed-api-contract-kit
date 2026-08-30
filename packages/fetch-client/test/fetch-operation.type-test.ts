import { defineOperation, defineSchema } from '@typed-api-contract-kit/core'

import { executeFetchOperation } from '../src/index.js'

const _operation = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: {
    params: defineSchema((_input): { readonly customerId: string } => ({
      customerId: 'customer-42',
    })),
    query: defineSchema((_input): { readonly includeHistory: boolean } => ({
      includeHistory: true,
    })),
  },
  responses: {
    200: defineSchema((_input): { readonly id: string; readonly name: string } => ({
      id: 'customer-42',
      name: 'Ada',
    })),
    404: defineSchema((_input): { readonly message: string } => ({
      message: 'Customer not found',
    })),
  },
})

const _fetch = () => Promise.resolve(new Response(null, { status: 204 }))

async function _narrowsDeclaredResponses(): Promise<void> {
  const response = await executeFetchOperation({
    baseUrl: 'https://api.example.test',
    fetch: _fetch,
    operation: _operation,
    operationId: 'getCustomer',
    request: {
      params: { customerId: 'customer-42' },
      query: { includeHistory: true },
    },
  })

  if (response.status === 200) {
    const _name: string = response.body.name
  } else {
    const _message: string = response.body.message
  }
}

void executeFetchOperation({
  baseUrl: 'https://api.example.test',
  fetch: _fetch,
  operation: _operation,
  operationId: 'getCustomer',
  // @ts-expect-error Every declared request location is required.
  request: { params: { customerId: 'customer-42' } },
})

void executeFetchOperation({
  baseUrl: 'https://api.example.test',
  fetch: _fetch,
  operation: _operation,
  operationId: 'getCustomer',
  request: {
    params: {
      // @ts-expect-error Path parameters use the schema output type.
      customerId: 42,
    },
    query: { includeHistory: true },
  },
})

void executeFetchOperation({
  baseUrl: 'https://api.example.test',
  fetch: _fetch,
  operation: _operation,
  operationId: 'getCustomer',
  request: {
    // @ts-expect-error The operation does not declare a request body.
    body: { name: 'Ada' },
    params: { customerId: 'customer-42' },
    query: { includeHistory: true },
  },
})
