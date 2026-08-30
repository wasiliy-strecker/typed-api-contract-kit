import {
  parseResponse,
  type AnyOperationDefinition,
  type RequestFor,
  type ResponseFor,
} from '@typed-api-contract-kit/core'

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface ExecuteFetchOperationOptions<Operation extends AnyOperationDefinition> {
  readonly baseUrl: string | URL
  readonly fetch?: FetchLike
  readonly operation: Operation
  readonly operationId: string
  readonly request: RequestFor<Operation>
  readonly signal?: AbortSignal
}

function recordAt(location: string, value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Fetch ${location} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

function serializeValue(location: string, value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return String(value)
  }
  throw new TypeError(`Fetch ${location} values must be primitive`)
}

function appendRecord(
  location: 'headers' | 'query',
  value: unknown,
  append: (name: string, value: string) => void,
): void {
  for (const [name, entry] of Object.entries(recordAt(location, value))) {
    if (entry === undefined) continue
    const values = Array.isArray(entry) ? entry : [entry]
    for (const item of values) append(name, serializeValue(location, item))
  }
}

function interpolatePath(path: string, params: unknown): string {
  const values = recordAt('params', params)
  return path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment
      const name = segment.slice(1)
      const value = values[name]
      if (typeof value !== 'string') {
        throw new TypeError(`Fetch path parameter ${name} must be a string`)
      }
      return encodeURIComponent(value)
    })
    .join('/')
}

function createUrl<Operation extends AnyOperationDefinition>(
  baseUrl: string | URL,
  operation: Operation,
  request: RequestFor<Operation>,
): URL {
  const base = new URL(baseUrl)
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
  const hasPathParameters = operation.path.split('/').some((segment) => segment.startsWith(':'))
  const path = hasPathParameters ? interpolatePath(operation.path, request.params) : operation.path
  const url = new URL(path.replace(/^\/+/, ''), base)

  if ('query' in request) {
    appendRecord('query', request.query, (name, value) => url.searchParams.append(name, value))
  }
  return url
}

function createRequestInit<Operation extends AnyOperationDefinition>(
  operation: Operation,
  request: RequestFor<Operation>,
  signal?: AbortSignal,
): RequestInit {
  const headers = new Headers()
  if ('headers' in request) {
    appendRecord('headers', request.headers, (name, value) => headers.append(name, value))
  }

  const init: RequestInit = { headers, method: operation.method }
  if (signal) init.signal = signal

  if ('body' in request) {
    const body = JSON.stringify(request.body)
    if (body === undefined) throw new TypeError('Fetch body must be JSON serializable')
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    init.body = body
  }
  return init
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined
  const text = await response.text()
  if (text.length === 0) return undefined

  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType === 'application/json' || contentType?.endsWith('+json')) {
    return JSON.parse(text) as unknown
  }
  return text
}

export async function executeFetchOperation<Operation extends AnyOperationDefinition>(
  options: ExecuteFetchOperationOptions<Operation>,
): Promise<ResponseFor<Operation>> {
  const response = await (options.fetch ?? globalThis.fetch)(
    createUrl(options.baseUrl, options.operation, options.request),
    createRequestInit(options.operation, options.request, options.signal),
  )
  const body = await readResponseBody(response)
  return parseResponse(options.operationId, options.operation, response.status, body)
}
