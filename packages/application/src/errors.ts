import { isDomainError, type DomainErrorCode } from '@reorigin/domain'

export type ApplicationErrorCode =
  | DomainErrorCode
  | 'command/invalid'
  | 'command/forbidden'
  | 'policy/agent-limit'
  | 'consent/not-found'
  | 'consent/inactive'
  | 'consent/duplicate'
  | 'memory/not-found'
  | 'title/locked'
  | 'host/confirmation-mismatch'
  | 'host/not-bound'
  | 'host/already-bound'
  | 'quest/not-found'
  | 'store/conflict'

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode

  constructor(code: ApplicationErrorCode, message: string) {
    super(message)
    this.name = 'ApplicationError'
    this.code = code
  }
}

export type Result<T> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: { readonly code: ApplicationErrorCode, readonly message: string } }

/** Expected failures become a Result; anything else is a defect and keeps throwing. */
export function toFailure(error: unknown): Result<never> {
  if (error instanceof ApplicationError || isDomainError(error)) {
    return { ok: false, error: { code: error.code, message: error.message } }
  }
  throw error
}
