# `@typed-api-contract-kit/fastify`

Fastify 5 adapter for registering individual operations or complete contracts with inferred handler
types and runtime request and response enforcement.

```ts
import Fastify from 'fastify'

import { defineContract, defineOperation } from '@typed-api-contract-kit/core'
import { registerContractRoutes } from '@typed-api-contract-kit/fastify'
import { fromZod } from '@typed-api-contract-kit/zod'
import { z } from 'zod'

const getCustomer = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: { params: fromZod(z.object({ customerId: z.uuid() })) },
  responses: {
    200: fromZod(z.object({ id: z.uuid(), name: z.string() })),
    404: fromZod(z.object({ message: z.string() })),
  },
})

const createCustomer = defineOperation({
  method: 'POST',
  path: '/customers',
  request: { body: fromZod(z.object({ name: z.string().min(1) })) },
  responses: {
    201: fromZod(z.object({ id: z.uuid(), name: z.string() })),
  },
})

const customerContract = defineContract({
  name: 'customer-api',
  operations: { createCustomer, getCustomer },
  version: '1.0.0',
})

const app = Fastify()
registerContractRoutes(app, {
  contract: customerContract,
  handlers: {
    createCustomer: async ({ request }) => ({
      body: await saveCustomer(request.body),
      status: 201,
    }),
    getCustomer: async ({ rawRequest, request }) => {
      const customer = await loadCustomer(request.params.customerId, rawRequest.user)
      return customer
        ? { body: customer, status: 200 }
        : { body: { message: 'Customer not found' }, status: 404 }
    },
  },
})
```

The handler map requires every operation ID and infers each operation's request and response types.
Missing or unknown handlers supplied from JavaScript or through an unsafe cast fail atomically with
a `FastifyContractRegistrationError` before any routes are registered. `registerContractRoute`
remains available when an application intentionally registers one operation at a time.

Invalid request values produce a stable `400` `FastifyContractError`. Invalid or undeclared handler
responses produce a stable `500` error before bytes are sent. Original validation errors remain
available through `error.cause`, while raw inputs and schema details are not exposed in the default
HTTP response.

Application and plugin-level Fastify hooks can provide authentication and decorate `rawRequest`.
Route-specific hook options are intentionally deferred to a later milestone.
