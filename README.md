# Typed API Contract Kit

[![CI](https://github.com/wasiliy-strecker/typed-api-contract-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/wasiliy-strecker/typed-api-contract-kit/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Schema-first API contracts for Node.js and React with runtime validation, typed clients, OpenAPI
generation, and breaking-change detection.

## Why this repository exists

TypeScript types disappear at runtime, while an OpenAPI document alone does not guarantee that a
server validates what it receives or returns what a client expects. This project is exploring one
contract model that can drive all of those boundaries without coupling application code to a web
framework or schema vendor.

The first milestone establishes the contract core. Literal HTTP methods, paths, request locations,
and response statuses remain available to the type system. Path parameters must have a matching
runtime schema, request and response types are inferred, and validation errors retain operation-level
context.

```ts
import {
  defineContract,
  defineOperation,
  defineSchema,
  parseRequest,
  type ResponseFor,
} from '@typed-api-contract-kit/core'

const customer = defineSchema((input): { id: string; name: string } => {
  if (typeof input !== 'object' || input === null) throw new TypeError('Expected customer')
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

const api = defineContract({
  name: 'customer-api',
  operations: { getCustomer },
  version: '1.0.0',
})

type GetCustomerResponse = ResponseFor<typeof api.operations.getCustomer>
const request = parseRequest('getCustomer', getCustomer, {
  params: { customerId: 'customer-42' },
})
```

The core deliberately accepts only a small `RuntimeSchema<T>` capability plus optional JSON Schema
metadata. Zod, TypeBox, Valibot, JSON Schema validators, or application-specific parsers can be
adapted without becoming transitive dependencies of every consumer. The separately versioned Zod 4
adapter already provides parsing, output inference, and Draft 2020-12 metadata.

## Architecture

```text
packages/core/               Contract model and runtime parsing (implemented)
packages/zod/                Optional Zod 4 and JSON Schema adapter (implemented)
packages/fastify/            Typed Fastify routes and contract handler maps (implemented)
packages/fetch-client/       Typed single-operation Fetch execution (implemented)
packages/react-query/        Query and mutation integration (planned)
packages/openapi/            OpenAPI 3.1 generation (planned)
packages/compatibility-cli/  Breaking-change analysis (planned)
examples/customer-api/       End-to-end reference application (planned)
```

Code generation and framework adapters will depend on the core. The core will not import them, so
runtime validation and type inference remain independently testable.

## Development

Requirements: Node.js 22.12 or newer and pnpm 11.13.1.

```bash
pnpm install
pnpm verify
```

`pnpm verify` checks formatting, ESLint, strict TypeScript including negative type tests, unit tests
with enforced coverage, and dual ESM/CommonJS package builds. CI repeats the gate on Node.js 22, 24,
and 26.

## Roadmap

1. Framework-neutral contract model and type inference — implemented
2. JSON Schema metadata and optional Zod 4 adapter — implemented
3. Fastify request and response enforcement — operation and contract adapters implemented
4. Typed Fetch client — single-operation executor implemented; error model and facade planned
5. React Query integration with stable cache keys
6. Deterministic OpenAPI 3.1 generation
7. Compatibility CLI for breaking contract changes
8. Clean-consumer package tests and first GitHub release

## License

[MIT](LICENSE)
