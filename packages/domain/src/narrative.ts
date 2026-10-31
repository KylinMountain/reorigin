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

/**
 * The System's voice, chosen by the Host at binding (docs/06). A persona only
 * changes tone; every boundary in the agent prompt holds for all of them.
 */
export const PERSONA_STYLES = ['calm', 'mentor', 'terse'] as const
export type PersonaStyle = (typeof PERSONA_STYLES)[number]

export const PERSONA_STYLE_INFO: Record<PersonaStyle, { readonly name: string, readonly description: string, readonly voice: string }> = {
  calm: { name: '冷静系统', description: '小说里的系统：冷静、简洁，用【】标注提示。', voice: '冷静、简洁、略带仪式感，常用【】标注系统提示。' },
  mentor: { name: '温和导师', description: '像一位耐心的前辈：先肯定，再给建议。', voice: '温和、鼓励，先肯定宿主已经做到的，再给出具体建议；少用【】。' },
  terse: { name: '极简终端', description: '只说必要的话，像命令行输出。', voice: '极简，像终端输出：短句、要点式，不寒暄，不用感叹号。' },
}

export function chapterFor(level: number): Chapter {
  return [...CHAPTERS].reverse().find(chapter => level >= chapter.fromLevel) ?? CHAPTERS[0]!
}
