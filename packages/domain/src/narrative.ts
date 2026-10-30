/**
 * P4 · Narrative framing. Chapters are presentation over the level only; they
 * unlock nothing and never feed rewards (ADR-005).
 */
export interface Chapter {
  readonly index: number
  readonly title: string
  readonly epigraph: string
  readonly fromLevel: number
}

export const CHAPTERS: readonly Chapter[] = [
  { index: 1, title: '觉醒', epigraph: '系统已绑定。第一步，是承认自己想要改变。', fromLevel: 1 },
  { index: 2, title: '立足', epigraph: '小的行动累积起来，开始有了形状。', fromLevel: 3 },
  { index: 3, title: '破局', epigraph: '你开始主动寻找难题，而不是等待它们。', fromLevel: 5 },
  { index: 4, title: '传承', epigraph: '你的经验开始照亮别人的路。', fromLevel: 8 },
]

export function chapterFor(level: number): Chapter {
  return [...CHAPTERS].reverse().find(chapter => level >= chapter.fromLevel) ?? CHAPTERS[0]!
}
