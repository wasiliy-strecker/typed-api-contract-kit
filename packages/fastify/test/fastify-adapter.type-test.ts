import { defineOperation, defineSchema } from '@typed-api-contract-kit/core'

import type { ContractHandler } from '../src/index.js'

const _operation = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: {
    params: defineSchema((_input): { readonly customerId: string } => ({ customerId: '42' })),
  },
  responses: {
    200: defineSchema((_input): { readonly id: string } => ({ id: '42' })),
    404: defineSchema((_input): { readonly message: string } => ({ message: 'not found' })),
  },
})

const _validHandler: ContractHandler<typeof _operation> = ({ request }) => ({
  body: { id: request.params.customerId },
  status: 200,
})

// @ts-expect-error Status 201 is not declared by the operation.
const _invalidStatusHandler: ContractHandler<typeof _operation> = () => {
  return { body: { id: '42' }, status: 201 }
}

const _invalidRequestHandler: ContractHandler<typeof _operation> = ({ request }) => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  // @ts-expect-error The operation does not declare a request body.
  const _body = request.body
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  return { body: { message: 'not found' }, status: 404 }
}
