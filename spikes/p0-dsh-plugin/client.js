// Browser half of the P0 spike, hand-written in the closure-factory form that
// DSH's client-modules loader expects (see packages/client/tsdown.client.ts in
// deepseek-harness). Shared modules come from the injected `require`, which
// answers only the platform module table (react, @deepseek-ai/cordis, ...).
window.__ModuleLoader__.load({ id: "dsh-plugin-reorigin", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement

const PANEL_ID = 'reorigin'

function ReOriginIcon({ size }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
    h('circle', { cx: 12, cy: 12, r: 8 }),
    h('path', { d: 'M12 4v4M12 16v4M4 12h4M16 12h4' }),
    h('circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' }))
}

function ReOriginPage() {
  const [ticks, setTicks] = React.useState(0)
  return h('div', {
    'data-testid': 'reorigin-panel',
    style: { padding: '48px 40px', fontFamily: 'ui-monospace, Menlo, monospace', color: 'inherit', height: '100%', overflow: 'auto' },
  },
    h('div', { style: { fontSize: 12, letterSpacing: 2, opacity: 0.6 } }, 'RE:ORIGIN · SYSTEM TERMINAL · P0 SPIKE'),
    h('h1', { style: { fontSize: 28, margin: '12px 0 8px' } }, '【系统已激活】'),
    h('p', { style: { opacity: 0.8, margin: '0 0 24px' } }, '宿主，你的人生没有读档键。但从这一刻起，你可以重新开始。'),
    h('button', {
      type: 'button',
      'data-testid': 'reorigin-tick',
      onClick: () => setTicks(n => n + 1),
      style: { padding: '6px 14px', border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit', cursor: 'pointer' },
    }, `交互检查 · ${ticks}`))
}

exports.name = 'reorigin'
exports.inject = ['slots', 'layout']

exports.apply = function apply(ctx) {
  console.log('[reorigin] client half loaded')
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, ReOriginPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    label: () => 'Re:Origin',
  }, ReOriginIcon))
}

return module.exports; } });
