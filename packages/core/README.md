# `@typed-api-contract-kit/core`

Framework-neutral HTTP contract definitions, type inference, and runtime validation for Typed API
Contract Kit.

The package owns no validation library. Any schema implementation with a `parse(unknown)` method can
participate, keeping contract types independent from Fastify, React, code generation, and a specific
schema vendor. A schema may also expose optional JSON Schema metadata for documentation and
compatibility tooling.

```ts
import {
  defineContract,
  defineOperation,
  defineSchema,
  parseResponse,
  type RequestFor,
} from '@typed-api-contract-kit/core'

const customer = defineSchema((input): { id: string; name: string } => {
  // A real application delegates this function to its schema library.
  return input as { id: string; name: string }
})

const getCustomer = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: {
    params: defineSchema((input): { customerId: string } => input as { customerId: string }),
  },
  responses: { 200: customer },
})

const contract = defineContract({
  name: 'customer-api',
  operations: { getCustomer },
  version: '1.0.0',
})

type GetCustomerRequest = RequestFor<typeof contract.operations.getCustomer>
const response = parseResponse('getCustomer', getCustomer, 200, { id: '42', name: 'Ada' })
```

Path parameters are checked at compile time. Runtime parsing wraps schema failures with operation,
location, and response-status context without exposing framework-specific errors.
