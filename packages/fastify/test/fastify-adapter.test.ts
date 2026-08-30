import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { defineContract, defineOperation, type ResponseFor } from '@typed-api-contract-kit/core'
import { fromZod } from '@typed-api-contract-kit/zod'

import {
  registerContractRoute,
  registerContractRoutes,
  type FastifyContractRegistrationError,
} from '../src/index.js'

const getCustomer = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: {
    params: fromZod(z.object({ customerId: z.uuid() })),
    query: fromZod(
      z.object({ includeHistory: z.string().transform((value) => value === 'true') }),
      { includeJsonSchema: false },
    ),
  },
  responses: {
    200: fromZod(z.object({ id: z.uuid(), name: z.string().min(1) })),
    404: fromZod(z.object({ message: z.string().min(1) })),
  },
})

const createCustomer = defineOperation({
  method: 'POST',
  path: '/customers',
  request: {
    body: fromZod(z.object({ name: z.string().min(1) })),
  },
  responses: {
    201: fromZod(z.object({ id: z.uuid(), name: z.string().min(1) })),
  },
})

const customerContract = defineContract({
  name: 'customer-api',
  operations: { createCustomer, getCustomer },
  version: '1.0.0',
})

const applications: FastifyInstance[] = []

function createApplication(): FastifyInstance {
  const application = Fastify()
  applications.push(application)
  return application
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close()))
})

describe('registerContractRoute', () => {
  it('passes validated request values and the raw Fastify request to the handler', async () => {
    const application = createApplication()

    registerContractRoute(application, {
      operation: getCustomer,
      operationId: 'getCustomer',
      handler: ({ rawRequest, request }) => {
        expect(request).toEqual({
          params: { customerId: 'f18c452a-1b77-4db9-b06b-957aee64d417' },
          query: { includeHistory: true },
        })
        expect(rawRequest.headers['x-request-id']).toBe('request-42')
        return {
          body: { id: request.params.customerId, name: 'Ada' },
          status: 200,
        } as const
      },
    })

    const response = await application.inject({
      headers: { 'x-request-id': 'request-42' },
      method: 'GET',
      url: '/customers/f18c452a-1b77-4db9-b06b-957aee64d417?includeHistory=true',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: 'f18c452a-1b77-4db9-b06b-957aee64d417',
      name: 'Ada',
    })
  })

  it('returns a stable 400 error and does not call the handler for an invalid request', async () => {
    const application = createApplication()
    const handler = vi.fn((): ResponseFor<typeof getCustomer> => ({
      body: { message: 'not found' },
      status: 404,
    }))
    registerContractRoute(application, {
      handler,
      operation: getCustomer,
      operationId: 'getCustomer',
    })

    const response = await application.inject({
      method: 'GET',
      url: '/customers/not-a-uuid?includeHistory=true',
    })

    expect(handler).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'CONTRACT_REQUEST_VALIDATION_FAILED',
      message: 'Request contract validation failed for getCustomer',
      statusCode: 400,
    })
  })

  it('returns a stable 500 error when the handler response body violates the contract', async () => {
    const application = createApplication()
    registerContractRoute(application, {
      operation: getCustomer,
      operationId: 'getCustomer',
      handler: () => ({ body: { id: 'invalid', name: '' }, status: 200 }) as const,
    })

    const response = await application.inject({
      method: 'GET',
      url: '/customers/f18c452a-1b77-4db9-b06b-957aee64d417?includeHistory=false',
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({
      code: 'CONTRACT_RESPONSE_VALIDATION_FAILED',
      message: 'Response contract validation failed for getCustomer',
      statusCode: 500,
    })
  })

  it('returns a stable 500 error for malformed and undeclared handler responses', async () => {
    const application = createApplication()
    registerContractRoute(application, {
      operation: getCustomer,
      operationId: 'malformedCustomer',
      handler: () => null as unknown as ResponseFor<typeof getCustomer>,
    })
    registerContractRoute(application, {
      operation: { ...getCustomer, path: '/undeclared/:customerId' },
      operationId: 'undeclaredCustomer',
      handler: () => ({ body: {}, status: 503 }) as unknown as ResponseFor<typeof getCustomer>,
    })

    const malformed = await application.inject({
      method: 'GET',
      url: '/customers/f18c452a-1b77-4db9-b06b-957aee64d417?includeHistory=false',
    })
    const undeclared = await application.inject({
      method: 'GET',
      url: '/undeclared/f18c452a-1b77-4db9-b06b-957aee64d417?includeHistory=false',
    })

    expect(malformed.statusCode).toBe(500)
    expect(malformed.json()).toMatchObject({ code: 'CONTRACT_RESPONSE_VALIDATION_FAILED' })
    expect(undeclared.statusCode).toBe(500)
    expect(undeclared.json()).toMatchObject({ code: 'CONTRACT_RESPONSE_VALIDATION_FAILED' })
  })

  it('does not reclassify application handler errors as contract failures', async () => {
    const application = createApplication()
    registerContractRoute(application, {
      operation: getCustomer,
      operationId: 'getCustomer',
      handler: () => {
        throw new Error('Database unavailable')
      },
    })

    const response = await application.inject({
      method: 'GET',
      url: '/customers/f18c452a-1b77-4db9-b06b-957aee64d417?includeHistory=false',
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({ message: 'Database unavailable' })
    expect(response.json()).not.toHaveProperty('code', 'CONTRACT_RESPONSE_VALIDATION_FAILED')
  })
})

describe('registerContractRoutes', () => {
  it('registers every operation with its operation-specific handler', async () => {
    const application = createApplication()

    registerContractRoutes(application, {
      contract: customerContract,
      handlers: {
        createCustomer: ({ request }) => ({
          body: {
            id: 'f18c452a-1b77-4db9-b06b-957aee64d417',
            name: request.body.name,
          },
          status: 201,
        }),
        getCustomer: ({ request }) => ({
          body: { id: request.params.customerId, name: 'Ada' },
          status: 200,
        }),
      },
    })

    const created = await application.inject({
      body: { name: 'Grace' },
      method: 'POST',
      url: '/customers',
    })
    const loaded = await application.inject({
      method: 'GET',
      url: '/customers/f18c452a-1b77-4db9-b06b-957aee64d417?includeHistory=false',
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({
      id: 'f18c452a-1b77-4db9-b06b-957aee64d417',
      name: 'Grace',
    })
    expect(loaded.statusCode).toBe(200)
    expect(loaded.json()).toEqual({
      id: 'f18c452a-1b77-4db9-b06b-957aee64d417',
      name: 'Ada',
    })
  })

  it('rejects a missing handler before registering any routes', () => {
    const application = createApplication()

    expect(() =>
      registerContractRoutes(application, {
        contract: customerContract,
        handlers: {
          createCustomer: () => ({
            body: { id: 'f18c452a-1b77-4db9-b06b-957aee64d417', name: 'Grace' },
            status: 201,
          }),
        } as never,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<FastifyContractRegistrationError>>({
        code: 'CONTRACT_HANDLER_MISSING',
        operationId: 'getCustomer',
      }),
    )

    expect(() =>
      registerContractRoute(application, {
        handler: () => ({ body: { message: 'not found' }, status: 404 }) as const,
        operation: getCustomer,
        operationId: 'getCustomer',
      }),
    ).not.toThrow()
  })

  it('rejects an unknown handler before registering any routes', () => {
    const application = createApplication()

    expect(() =>
      registerContractRoutes(application, {
        contract: customerContract,
        handlers: {
          createCustomer: () => ({
            body: { id: 'f18c452a-1b77-4db9-b06b-957aee64d417', name: 'Grace' },
            status: 201,
          }),
          getCustomer: () => ({ body: { message: 'not found' }, status: 404 }),
          removeCustomer: () => ({ body: undefined, status: 204 }),
        } as never,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<FastifyContractRegistrationError>>({
        code: 'CONTRACT_HANDLER_UNKNOWN',
        operationId: 'removeCustomer',
      }),
    )

    expect(() =>
      registerContractRoute(application, {
        handler: () =>
          ({
            body: { id: 'f18c452a-1b77-4db9-b06b-957aee64d417', name: 'Grace' },
            status: 201,
          }) as const,
        operation: createCustomer,
        operationId: 'createCustomer',
      }),
    ).not.toThrow()
  })
})
