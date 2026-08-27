import { defineOperation, defineSchema } from '../src/index.js'

const response = defineSchema((_input): { readonly ok: true } => ({ ok: true }))
const validParams = defineSchema((_input): { readonly customerId: string } => ({
  customerId: 'customer-42',
}))

const _validOperation = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  request: { params: validParams },
  responses: { 200: response },
})

const _missingParams = defineOperation({
  method: 'GET',
  path: '/customers/:customerId',
  // @ts-expect-error A path parameter must have a matching params schema.
  request: {},
  responses: { 200: response },
})

const unexpectedParams = defineSchema((_input): { readonly customerId: string } => ({
  customerId: 'customer-42',
}))

const _unexpectedParams = defineOperation({
  method: 'GET',
  path: '/customers',
  request: {
    // @ts-expect-error Static paths do not accept a params schema.
    params: unexpectedParams,
  },
  responses: { 200: response },
})
