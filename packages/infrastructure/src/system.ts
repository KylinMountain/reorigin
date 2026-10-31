import { randomUUID } from 'node:crypto'
import type { Clock, IdSource } from '@reorigin/application'

const pad = (value: number): string => String(value).padStart(2, '0')

/** Calendar fields of an instant in an IANA zone (or the machine's zone when omitted). */
function fields(iso: string, zone: string | undefined): { year: number, month: number, day: number, hour: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map(part => [part.type, part.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) }
}

/** Wall clock; local calendar math uses the Host's chosen zone, else the machine's. */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  localHour: (iso, zone) => fields(iso, zone).hour,
  localDay: (iso, zone) => {
    const { year, month, day } = fields(iso, zone)
    return `${year}-${pad(month)}-${pad(day)}`
  },
  localDayStart: (iso, zone) => {
    // Binary-search the first instant carrying today's local date; 36 hours back covers any offset or DST shift.
    const target = systemClock.localDay(iso, zone)
    let low = Date.parse(iso) - 36 * 3_600_000
    let high = Date.parse(iso)
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2)
      if (systemClock.localDay(new Date(mid).toISOString(), zone) === target) high = mid
      else low = mid
    }
    return new Date(high).toISOString()
  },
}

export const randomIds: IdSource = { next: prefix => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}` }
