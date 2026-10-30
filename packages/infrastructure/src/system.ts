import { randomUUID } from 'node:crypto'
import type { Clock, IdSource } from '@reorigin/application'

const pad = (value: number): string => String(value).padStart(2, '0')

/** Wall clock in the process's local time zone, which is the Host's on a personal machine. */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  localHour: iso => new Date(iso).getHours(),
  localDay: (iso) => {
    const date = new Date(iso)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  },
  localDayStart: (iso) => {
    const date = new Date(iso)
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
  },
}

export const randomIds: IdSource = { next: prefix => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}` }
