import { randomUUID } from 'node:crypto'
import type { Clock, IdSource } from '@reorigin/application'

export const systemClock: Clock = { now: () => new Date().toISOString() }

export const randomIds: IdSource = { next: prefix => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}` }
