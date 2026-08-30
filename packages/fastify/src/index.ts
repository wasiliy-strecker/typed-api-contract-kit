import {
  ContractValueError,
  UndeclaredResponseError,
  parseRequest,
  parseResponse,
  type AnyApiContractDefinition,
  type AnyOperationDefinition,
  type RequestFor,
  type ResponseFor,
} from '@typed-api-contract-kit/core'
import type { FastifyInstance, FastifyRequest } from 'fastify'

export type FastifyContractErrorCode =
  'CONTRACT_REQUEST_VALIDATION_FAILED' | 'CONTRACT_RESPONSE_VALIDATION_FAILED'

export type FastifyContractRegistrationErrorCode =
  'CONTRACT_HANDLER_MISSING' | 'CONTRACT_HANDLER_UNKNOWN'

export class FastifyContractError extends Error {
  public override readonly name = 'FastifyContractError'

  public constructor(
    public readonly code: FastifyContractErrorCode,
    public readonly operationId: string,
    public readonly statusCode: 400 | 500,
    options: ErrorOptions,
  ) {
    const boundary = statusCode === 400 ? 'Request' : 'Response'
    super(`${boundary} contract validation failed for ${operationId}`, options)
  }
}

export class FastifyContractRegistrationError extends Error {
  public override readonly name = 'FastifyContractRegistrationError'

  public constructor(
    public readonly code: FastifyContractRegistrationErrorCode,
    public readonly operationId: string,
  ) {
    const issue = code === 'CONTRACT_HANDLER_MISSING' ? 'Missing' : 'Unknown'
    super(`${issue} contract handler for ${operationId}`)
  }
}

export interface ContractHandlerContext<Operation extends AnyOperationDefinition> {
  readonly rawRequest: FastifyRequest
  readonly request: RequestFor<Operation>
}

export type ContractHandler<Operation extends AnyOperationDefinition> = (
  context: ContractHandlerContext<Operation>,
) => Promise<ResponseFor<Operation>> | ResponseFor<Operation>

export interface RegisterContractRouteOptions<Operation extends AnyOperationDefinition> {
  readonly handler: ContractHandler<Operation>
  readonly operation: Operation
  readonly operationId: string
}

export type ContractHandlers<Contract extends AnyApiContractDefinition> = Readonly<{
  [OperationId in keyof Contract['operations']]: ContractHandler<
    Contract['operations'][OperationId]
  >
}>

export interface RegisterContractRoutesOptions<Contract extends AnyApiContractDefinition> {
  readonly contract: Contract
  readonly handlers: ContractHandlers<Contract>
}

function requestError(operationId: string, cause: ContractValueError): FastifyContractError {
  return new FastifyContractError('CONTRACT_REQUEST_VALIDATION_FAILED', operationId, 400, { cause })
}

function responseError(operationId: string, cause: unknown): FastifyContractError {
  return new FastifyContractError('CONTRACT_RESPONSE_VALIDATION_FAILED', operationId, 500, {
    cause,
  })
}

function isHandlerResponse(
  value: unknown,
): value is { readonly body: unknown; readonly status: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'body' in value &&
    'status' in value &&
    typeof value.status === 'number'
  )
}

export function registerContractRoute<Operation extends AnyOperationDefinition>(
  fastify: FastifyInstance,
  options: RegisterContractRouteOptions<Operation>,
): void {
  fastify.route({
    method: options.operation.method,
    url: options.operation.path,
    async handler(rawRequest, reply) {
      let request: RequestFor<Operation>
      try {
        request = parseRequest(options.operationId, options.operation, {
          body: rawRequest.body,
          headers: rawRequest.headers,
          params: rawRequest.params,
          query: rawRequest.query,
        })
      } catch (error) {
        if (error instanceof ContractValueError) throw requestError(options.operationId, error)
        throw error
      }

      const handlerResponse = await options.handler({ rawRequest, request })
      if (!isHandlerResponse(handlerResponse)) {
        throw responseError(
          options.operationId,
          new TypeError('Contract handler must return a status and body'),
        )
      }

      try {
        const response = parseResponse(
          options.operationId,
          options.operation,
          handlerResponse.status,
          handlerResponse.body,
        )
        return reply.code(response.status).send(response.body as never)
      } catch (error) {
        if (error instanceof ContractValueError || error instanceof UndeclaredResponseError) {
          throw responseError(options.operationId, error)
        }
        throw error
      }
    },
  })
}

function registerOperation<
  Contract extends AnyApiContractDefinition,
  OperationId extends Extract<keyof Contract['operations'], string>,
>(
  fastify: FastifyInstance,
  options: RegisterContractRoutesOptions<Contract>,
  operationId: OperationId,
): void {
  const operation = options.contract.operations[operationId] as Contract['operations'][OperationId]

  registerContractRoute<Contract['operations'][OperationId]>(fastify, {
    handler: options.handlers[operationId],
    operation,
    operationId,
  })
}

export function registerContractRoutes<Contract extends AnyApiContractDefinition>(
  fastify: FastifyInstance,
  options: RegisterContractRoutesOptions<Contract>,
): void {
  const operationIds = Object.keys(options.contract.operations) as Array<
    Extract<keyof Contract['operations'], string>
  >
  const runtimeHandlers = options.handlers as Readonly<Record<string, unknown>>

  for (const operationId of operationIds) {
    if (typeof runtimeHandlers[operationId] !== 'function') {
      throw new FastifyContractRegistrationError('CONTRACT_HANDLER_MISSING', operationId)
    }
  }

  for (const operationId of Object.keys(runtimeHandlers)) {
    if (!Object.hasOwn(options.contract.operations, operationId)) {
      throw new FastifyContractRegistrationError('CONTRACT_HANDLER_UNKNOWN', operationId)
    }
  }

  for (const operationId of operationIds) {
    registerOperation(fastify, options, operationId)
  }
}
