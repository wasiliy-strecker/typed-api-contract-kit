import type { RuntimeSchema, SchemaOutput } from './schema.js'

export type HttpMethod = 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT'

type SegmentParameter<Segment extends string> = Segment extends `:${infer Parameter}`
  ? Parameter
  : never

export type PathParameter<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? SegmentParameter<Head> | PathParameter<Tail>
  : SegmentParameter<Path>

export type PathParameters<Path extends string> = Readonly<Record<PathParameter<Path>, string>>

export type RequestLocation = 'body' | 'headers' | 'params' | 'query'

export type RequestSchemas = Readonly<Partial<Record<RequestLocation, RuntimeSchema<unknown>>>>
export type ResponseSchemas = Readonly<Record<number, RuntimeSchema<unknown>>>

export interface OperationDefinition<
  Method extends HttpMethod = HttpMethod,
  Path extends string = string,
  Request extends RequestSchemas = RequestSchemas,
  Responses extends ResponseSchemas = ResponseSchemas,
> {
  readonly method: Method
  readonly path: Path
  readonly request: Request
  readonly responses: Responses
  readonly summary?: string
}

export type AnyOperationDefinition = OperationDefinition<
  HttpMethod,
  string,
  RequestSchemas,
  ResponseSchemas
>

export interface ApiContractDefinition<
  Name extends string = string,
  Version extends string = string,
  Operations extends Readonly<Record<string, AnyOperationDefinition>> = Readonly<
    Record<string, AnyOperationDefinition>
  >,
> {
  readonly name: Name
  readonly version: Version
  readonly operations: Operations
}

export type AnyApiContractDefinition = ApiContractDefinition<
  string,
  string,
  Readonly<Record<string, AnyOperationDefinition>>
>

export type RequestFor<Operation extends AnyOperationDefinition> = Readonly<{
  [Location in keyof Operation['request']]: Operation['request'][Location] extends RuntimeSchema<
    infer Output
  >
    ? Output
    : never
}>

export type ResponseStatus<Operation extends AnyOperationDefinition> =
  keyof Operation['responses'] & number

export type ResponseFor<
  Operation extends AnyOperationDefinition,
  Status extends ResponseStatus<Operation> = ResponseStatus<Operation>,
> =
  Status extends ResponseStatus<Operation>
    ? Readonly<{
        status: Status
        body: SchemaOutput<Operation['responses'][Status]>
      }>
    : never

export type OperationFor<
  Contract extends AnyApiContractDefinition,
  OperationId extends keyof Contract['operations'],
> = Contract['operations'][OperationId]

export interface RawRequestValues {
  readonly body?: unknown
  readonly headers?: unknown
  readonly params?: unknown
  readonly query?: unknown
}
