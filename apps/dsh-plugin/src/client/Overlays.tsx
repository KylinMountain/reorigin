// P4 presentation: the awakening ritual after binding and the level-up flash.
// Pure decoration over state the Host already earned; nothing here writes.
import { useEffect, useState } from 'react'
import type { Chapter } from '@reorigin/domain'

const VOICE_KEY = 'reorigin.voice'

/** Per-browser preference for spoken System announcements; off unless the viewer turns it on. */
export function voiceEnabled(): boolean {
  try {
    return window.localStorage.getItem(VOICE_KEY) === 'on'
  } catch {
    return false
  }
}

export function setVoiceEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(VOICE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked: the toggle simply does not persist.
  }
}

/** Speak a System line through the browser's own speech synthesis, if the viewer opted in and the browser supports it. */
export function announce(text: string): void {
  if (!voiceEnabled() || typeof window.speechSynthesis === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.05
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

const AWAKENING = [
  '检测到符合条件的宿主……',
  '正在建立绑定协议……',
  '人生没有读档键。',
  '但从这一刻起，你可以重新开始。',
  '【系统已激活 · 宿主绑定完成】',
]

export function Awakening({ name, onDone }: { name: string, onDone: () => void }) {
  const [shown, setShown] = useState(1)
  useEffect(() => { announce(`系统已激活。宿主${name}，绑定完成。`) }, [name])
  useEffect(() => {
    if (shown < AWAKENING.length) {
      const timer = window.setTimeout(() => setShown(count => count + 1), 650)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(onDone, 1400)
    return () => window.clearTimeout(timer)
  }, [shown, onDone])
  return (
    <div className="ro-overlay" role="dialog" aria-label="系统觉醒" onClick={onDone}>
      <div className="ro-overlay-box ro-mono">
        {AWAKENING.slice(0, shown).map(line => <p key={line} className="ro-line">{line}</p>)}
        {shown >= AWAKENING.length && <p className="ro-line ro-strong">宿主：{name}</p>}
      </div>
    </div>
  )
}

export function LevelUp({ level, chapter, onDone }: { level: number, chapter: Chapter, onDone: () => void }) {
  useEffect(() => { announce(`升级。当前等级 ${level}。第 ${chapter.index} 章，${chapter.title}。`) }, [level, chapter])
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200)
    return () => window.clearTimeout(timer)
  }, [onDone])
  return (
    <div className="ro-overlay" role="dialog" aria-label="升级" onClick={onDone}>
      <div className="ro-overlay-box ro-levelup">
        <div className="ro-kicker">LEVEL UP</div>
        <div className="ro-level-big">Lv.{level}</div>
        <p className="ro-line">第 {chapter.index} 章「{chapter.title}」</p>
        <p className="ro-muted">{chapter.epigraph}</p>
      </div>
    </div>
  )
}
