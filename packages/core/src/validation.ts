import { ContractValueError, UndeclaredResponseError } from './errors.js'
import type { RuntimeSchema } from './schema.js'
import type {
  AnyOperationDefinition,
  RawRequestValues,
  RequestFor,
  RequestLocation,
  RequestSchemas,
  ResponseFor,
  ResponseSchemas,
} from './types.js'

const requestLocations = ['params', 'query', 'headers', 'body'] as const

function parseValue(
  operationId: string,
  location: RequestLocation | 'response',
  schema: RuntimeSchema<unknown>,
  value: unknown,
  status?: number,
): unknown {
  try {
    return schema.parse(value)
  } catch (cause) {
    const suffix = status === undefined ? location : `response ${status}`
    throw new ContractValueError(
      operationId,
      location,
      `Validation failed for ${operationId} ${suffix}`,
      status === undefined ? { cause } : { cause, status },
    )
  }
}

export function parseRequest<Operation extends AnyOperationDefinition>(
  operationId: string,
  operation: Operation,
  values: RawRequestValues,
): RequestFor<Operation> {
  const schemas: RequestSchemas = operation.request
  const result: Partial<Record<RequestLocation, unknown>> = {}

  for (const location of requestLocations) {
    const schema = schemas[location]
    if (schema) result[location] = parseValue(operationId, location, schema, values[location])
  }

  return result as RequestFor<Operation>
}

export function parseResponse<Operation extends AnyOperationDefinition>(
  operationId: string,
  operation: Operation,
  status: number,
  body: unknown,
): ResponseFor<Operation> {
  const responses: ResponseSchemas = operation.responses
  const schema = responses[status]
  if (!schema) throw new UndeclaredResponseError(operationId, status)

  return {
    body: parseValue(operationId, 'response', schema, body, status),
    status,
  } as ResponseFor<Operation>
}
