import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { defineOperation, type ResponseFor } from '@typed-api-contract-kit/core'
import { fromZod } from '@typed-api-contract-kit/zod'

import { registerContractRoute } from '../src/index.js'

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
