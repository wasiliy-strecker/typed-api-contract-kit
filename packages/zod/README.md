# `@typed-api-contract-kit/zod`

Optional Zod 4 adapter for Typed API Contract Kit. It keeps Zod outside the framework-neutral core
while providing runtime parsing, output inference, and JSON Schema Draft 2020-12 metadata.

```ts
import { defineOperation } from '@typed-api-contract-kit/core'
import { fromZod } from '@typed-api-contract-kit/zod'
import { z } from 'zod'

const getCustomer = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: {
    params: fromZod(z.object({ customerId: z.uuid() })),
  },
  responses: {
    200: fromZod(z.object({ id: z.uuid(), name: z.string().min(1) })),
  },
})
```

Metadata describes parsed output by default. Pass `{ io: 'input' }` when documentation should
describe accepted input instead, for example before defaults are applied.

Zod transforms cannot be represented faithfully as JSON Schema. For a runtime-only transformed
schema, pass `{ includeJsonSchema: false }`. Async refinements are intentionally unsupported because
the core parsing contract is synchronous.
