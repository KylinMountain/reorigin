// P4 presentation: the awakening ritual after binding and the level-up flash.
// Pure decoration over state the Host already earned; nothing here writes.
import { useEffect, useState } from 'react'
import type { Chapter } from '@reorigin/domain'
import { ASSET_ROUTE } from '../shared/remote.ts'

/** Art generated locally with Qwen Image (see apps/dsh-plugin/assets); served by the Host's asset route. */
export const ART = { emblem: `${ASSET_ROUTE}/emblem.jpg`, awakening: `${ASSET_ROUTE}/awakening.jpg` } as const

declare global {
  interface Window { __reoriginBooted?: boolean }
}

/** The boot sequence plays once per page load, the first time the System is opened. */
export function shouldBoot(): boolean {
  if (window.__reoriginBooted === true) return false
  window.__reoriginBooted = true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const BOOT_MIN_MS = 1700
const BOOT_EXIT_MS = 650

/**
 * The System powering on over its own panel while the dashboard loads. The bar
 * reflects the real load: it idles short of full until the Host answers, so the
 * sequence never claims a sync that has not happened. Click or Esc skips.
 */
export function SystemBoot({ ready, name, onDone }: { ready: boolean, name: string | null, onDone: () => void }) {
  const [minimumElapsed, setMinimumElapsed] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), BOOT_MIN_MS)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!(ready && minimumElapsed) || leaving) return
    setLeaving(true)
  }, [ready, minimumElapsed, leaving])
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onDone, BOOT_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, onDone])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === ' ') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])
  const done = ready && minimumElapsed
  return (
    <div className="ro-boot-screen" data-leaving={leaving} role="status" aria-label="系统启动中" onClick={onDone}>
      <div className="ro-boot-bg" style={{ backgroundImage: `url(${ART.awakening})` }} />
      <div className="ro-boot-core">
        <img className="ro-boot-emblem" src={ART.emblem} alt="" />
        <p className="ro-boot-line" style={{ animationDelay: '.25s' }}>【系统启动】</p>
        <p className="ro-boot-line ro-boot-sub" style={{ animationDelay: '.7s' }}>
          {!done ? '正在同步宿主数据' : name === null ? '检测到新的宿主候选' : `同步完成。欢迎回来，${name}。`}
        </p>
        <div className="ro-boot-bar"><span data-done={done} /></div>
      </div>
      <p className="ro-boot-hint">点击或按 Esc 跳过</p>
    </div>
  )
}

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
    <div className="ro-overlay ro-awaken" role="dialog" aria-label="系统觉醒" onClick={onDone} style={{ backgroundImage: `url(${ART.awakening})` }}>
      <img className="ro-awaken-emblem" src={ART.emblem} alt="" />
      <div className="ro-overlay-box">
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
        <img className="ro-levelup-emblem" src={ART.emblem} alt="" />
        <div className="ro-kicker">LEVEL UP</div>
        <div className="ro-level-big">Lv.{level}</div>
        <p className="ro-line">第 {chapter.index} 章「{chapter.title}」</p>
        <p className="ro-muted">{chapter.epigraph}</p>
      </div>
    </div>
  )
}
