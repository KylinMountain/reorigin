// Browser half: the sidebar entry and the full main workspace. Built by
// scripts/build.ts into DSH's `__ModuleLoader__` closure format; `react` and
// `react/jsx-runtime` come from DSH's shared platform module table.
import type { ComponentType } from 'react'
import { PANEL_ID } from '../shared/remote.ts'
import { ReOriginClient, type Rpc } from './api.ts'
import { SystemPanel } from './SystemPanel.tsx'
import { STYLES } from './styles.ts'

/** The slice of the DSH client Context this plugin uses. */
interface ClientContext {
  effect(execute: () => () => void, label?: string): void
  slots: {
    inject(name: string, register: () => () => void): void
    register(options: Record<string, unknown>, component: ComponentType<never>): () => void
  }
  layout: { selectPanel(id: string): void }
  connection: { rpc: Rpc }
}

export const name = 'reorigin'
export const inject = ['slots', 'layout', 'connection']

declare global {
  interface Window { __reoriginLanded?: boolean }
}

function SidebarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <circle cx={12} cy={12} r={8} />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
      <circle cx={12} cy={12} r={1.6} fill="currentColor" />
    </svg>
  )
}

export function apply(ctx: ClientContext): void {
  const client = new ReOriginClient(ctx.connection.rpc)
  const Page = () => <SystemPanel client={client} />

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-plugin-reorigin'
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'reorigin: styles')

  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({ name: 'main', key: PANEL_ID }, Page)
    // Land on the System once per page load; re-enabling later must not steal focus.
    if (window.__reoriginLanded !== true) {
      window.__reoriginLanded = true
      ctx.layout.selectPanel(PANEL_ID)
    }
    return dispose
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    label: () => 'Re:Origin',
  }, SidebarIcon as ComponentType<never>))
}
