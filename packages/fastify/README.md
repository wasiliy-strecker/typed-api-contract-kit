# `@typed-api-contract-kit/fastify`

Fastify 5 adapter for registering a contract operation with inferred handler types and runtime
request and response enforcement.

```ts
import Fastify from 'fastify'

import { defineOperation } from '@typed-api-contract-kit/core'
import { registerContractRoute } from '@typed-api-contract-kit/fastify'
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

const app = Fastify()
registerContractRoute(app, {
  operation: getCustomer,
  operationId: 'getCustomer',
  handler: async ({ rawRequest, request }) => {
    const customer = await loadCustomer(request.params.customerId, rawRequest.user)
    return customer
      ? { body: customer, status: 200 }
      : { body: { message: 'Customer not found' }, status: 404 }
  },
})
```

Invalid request values produce a stable `400` `FastifyContractError`. Invalid or undeclared handler
responses produce a stable `500` error before bytes are sent. Original validation errors remain
available through `error.cause`, while raw inputs and schema details are not exposed in the default
HTTP response.

Application and plugin-level Fastify hooks can provide authentication and decorate `rawRequest`.
Contract-wide handler maps and route-specific hook options are intentionally deferred to a later
milestone.
