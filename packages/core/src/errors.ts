import type { RequestLocation } from './types.js'

export type ContractDefinitionErrorCode =
  | 'DUPLICATE_OPERATION'
  | 'EMPTY_CONTRACT_NAME'
  | 'EMPTY_CONTRACT_VERSION'
  | 'EMPTY_OPERATION_ID'
  | 'INVALID_PATH'
  | 'INVALID_RESPONSE_STATUS'
  | 'MISSING_OPERATION'
  | 'MISSING_RESPONSE'

export class ContractDefinitionError extends Error {
  public override readonly name = 'ContractDefinitionError'

  public constructor(
    public readonly code: ContractDefinitionErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export class ContractValueError extends Error {
  public override readonly name = 'ContractValueError'

  public constructor(
    public readonly operationId: string,
    public readonly location: RequestLocation | 'response',
    message: string,
    options: ErrorOptions & { readonly status?: number },
  ) {
    super(message, options)
    this.status = options.status
  }

  public readonly status: number | undefined
}

export class UndeclaredResponseError extends Error {
  public override readonly name = 'UndeclaredResponseError'

  public constructor(
    public readonly operationId: string,
    public readonly status: number,
  ) {
    super(`Operation ${operationId} does not declare response status ${status}`)
  }
}
