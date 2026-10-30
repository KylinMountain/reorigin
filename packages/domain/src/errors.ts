/** Stable failure codes the domain raises; callers branch on `code`, never on message text. */
export type DomainErrorCode =
  | 'host/invalid'
  | 'quest/invalid'
  | 'quest/illegal-transition'
  | 'quest/not-owned'
  | 'evidence/invalid'
  | 'settlement/not-completed'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
