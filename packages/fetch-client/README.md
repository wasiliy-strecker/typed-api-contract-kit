# `@typed-api-contract-kit/fetch-client`

Low-level Fetch execution for one Typed API Contract Kit operation. Request locations are inferred
from the operation, HTTP values are serialized, and every response is checked against its declared
status schema.

```ts
import { executeFetchOperation } from '@typed-api-contract-kit/fetch-client'

const response = await executeFetchOperation({
  baseUrl: 'https://api.example.com/v1',
  operation: customerContract.operations.getCustomer,
  operationId: 'getCustomer',
  request: {
    params: { customerId: 'customer-42' },
    query: { includeHistory: true },
  },
  signal: abortController.signal,
})

if (response.status === 200) {
  console.log(response.body.name)
} else {
  console.error(response.body.message)
}
```

Path parameters are percent-encoded. Query and header objects accept primitive values or arrays of
primitive values; `undefined` entries are omitted. Arrays become repeated query values and repeated
header values. Declared bodies are serialized as JSON, with `application/json` supplied unless the
contract request includes another content type.

Responses with an `application/json` or `+json` media type are decoded as JSON. Other response
bodies are read as text, while empty, `204`, and `205` responses produce `undefined`. The executor
then delegates to the core `parseResponse`, preserving its validation and undeclared-status errors.

The optional `fetch` setting supports deterministic tests and runtimes with a custom Fetch
implementation. It defaults to `globalThis.fetch`. Transport and Problem Details errors plus a
contract-wide client facade are intentionally reserved for later milestones.
