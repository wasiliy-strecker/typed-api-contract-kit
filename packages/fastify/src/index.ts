import {
  ContractValueError,
  UndeclaredResponseError,
  parseRequest,
  parseResponse,
  type AnyOperationDefinition,
  type RequestFor,
  type ResponseFor,
} from '@typed-api-contract-kit/core'
import type { FastifyInstance, FastifyRequest } from 'fastify'

export type FastifyContractErrorCode =
  'CONTRACT_REQUEST_VALIDATION_FAILED' | 'CONTRACT_RESPONSE_VALIDATION_FAILED'

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
