import { DomainError } from './errors.ts'

/** The person bound to the system. One Host per installation in the MVP. */
export interface Host {
  readonly id: string
  readonly displayName: string
  /** Long-term goals the Host declared at binding; quests reference them in prose only. */
  readonly goals: readonly string[]
  readonly boundAt: string
  /** Key of the unlocked title the Host chose to display; null shows none. */
  readonly titleKey: string | null
}

export const MAX_DISPLAY_NAME = 40
export const MAX_GOALS = 5

export function bindHost(input: { id: string, displayName: string, goals: readonly string[], at: string }): Host {
  const displayName = input.displayName.trim()
  if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME) {
    throw new DomainError('host/invalid', `display name must be 1–${MAX_DISPLAY_NAME} characters`)
  }
  const goals = input.goals.map(goal => goal.trim()).filter(goal => goal.length > 0)
  if (goals.length > MAX_GOALS) throw new DomainError('host/invalid', `at most ${MAX_GOALS} goals`)
  return { id: input.id, displayName, goals, boundAt: input.at, titleKey: null }
}
