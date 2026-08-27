import { ContractDefinitionError } from './errors.js'
import type { RuntimeSchema } from './schema.js'
import type {
  AnyOperationDefinition,
  ApiContractDefinition,
  HttpMethod,
  OperationDefinition,
  PathParameter,
  PathParameters,
  RequestSchemas,
  ResponseSchemas,
} from './types.js'

type PathParameterSchemas<Path extends string> = [PathParameter<Path>] extends [never]
  ? { readonly params?: never }
  : { readonly params: RuntimeSchema<PathParameters<Path>> }

type OperationInput<
  Method extends HttpMethod,
  Path extends string,
  Request extends RequestSchemas,
  Responses extends ResponseSchemas,
> = Readonly<{
  method: Method
  path: Path
  request: Request & PathParameterSchemas<Path>
  responses: Responses
  summary?: string
}>

function assertOperationPath(path: string): void {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new ContractDefinitionError(
      'INVALID_PATH',
      `Operation path must start with / and exclude query strings or fragments: ${path}`,
    )
  }
}

function assertResponseStatuses(responses: ResponseSchemas): void {
  const statuses = Object.keys(responses).map(Number)
  if (statuses.length === 0) {
    throw new ContractDefinitionError('MISSING_RESPONSE', 'An operation must declare a response')
  }

  for (const status of statuses) {
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new ContractDefinitionError(
        'INVALID_RESPONSE_STATUS',
        `Response status must be an integer between 100 and 599: ${status}`,
      )
    }
  }
}

export function defineOperation<
  const Method extends HttpMethod,
  const Path extends string,
  const Request extends RequestSchemas,
  const Responses extends ResponseSchemas,
>(
  input: OperationInput<Method, Path, Request, Responses>,
): OperationDefinition<Method, Path, Request, Responses> {
  assertOperationPath(input.path)
  assertResponseStatuses(input.responses)
  return Object.freeze({
    ...input,
    request: Object.freeze({ ...input.request }),
    responses: Object.freeze({ ...input.responses }),
  })
}

export function defineContract<
  const Name extends string,
  const Version extends string,
  const Operations extends Readonly<Record<string, AnyOperationDefinition>>,
>(input: {
  readonly name: Name
  readonly version: Version
  readonly operations: Operations
}): ApiContractDefinition<Name, Version, Operations> {
  if (input.name.trim().length === 0) {
    throw new ContractDefinitionError('EMPTY_CONTRACT_NAME', 'Contract name must not be empty')
  }
  if (input.version.trim().length === 0) {
    throw new ContractDefinitionError(
      'EMPTY_CONTRACT_VERSION',
      'Contract version must not be empty',
    )
  }

  const operations = Object.entries(input.operations)
  if (operations.length === 0) {
    throw new ContractDefinitionError(
      'MISSING_OPERATION',
      'A contract must declare at least one operation',
    )
  }

  const routes = new Map<string, string>()
  for (const [operationId, operation] of operations) {
    if (operationId.trim().length === 0) {
      throw new ContractDefinitionError('EMPTY_OPERATION_ID', 'Operation ID must not be empty')
    }

    const route = `${operation.method} ${operation.path}`
    if (routes.has(route)) {
      const existingOperation = routes.get(route)
      throw new ContractDefinitionError(
        'DUPLICATE_OPERATION',
        `Operations ${existingOperation} and ${operationId} both declare ${route}`,
      )
    }
    routes.set(route, operationId)
  }

  return Object.freeze({ ...input, operations: Object.freeze({ ...input.operations }) })
}
