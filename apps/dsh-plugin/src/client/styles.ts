// Scoped under .ro-root and built on DSH's own theme tokens (with fallbacks) so
// the System follows DSH's light/dark palette.
export const STYLES = `
.ro-root {
  --ro-fg: var(--dsw-alias-label-primary, #e8e8e8);
  --ro-fg-2: var(--dsw-alias-label-secondary, #a8a8a8);
  --ro-fg-3: var(--dsw-alias-label-tertiary, #7a7a7a);
  --ro-border: var(--dsw-alias-border-l2, rgba(127,127,127,.28));
  --ro-surface: var(--dsw-alias-bg-layer-3, rgba(127,127,127,.08));
  --ro-hover: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14));
  --ro-accent: var(--dsw-alias-state-business-primary, #4d8bff);
  --ro-ok: var(--dsw-alias-state-success-primary, #2fb36b);
  --ro-warn: var(--dsw-alias-state-warn-primary, #d99a1e);
  --ro-err: var(--dsw-alias-state-error-primary, #e5484d);
  --ro-mono: var(--dsw-font-mono, ui-monospace, Menlo, monospace);
  --ro-radius: var(--dsw-radius-md, 8px);
  color: var(--ro-fg);
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 40px clamp(16px, 4vw, 48px) 64px;
  font-size: 14px;
  line-height: 1.55;
}
.ro-root *, .ro-root *::before, .ro-root *::after { box-sizing: border-box; }
.ro-wrap { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
.ro-kicker { font-family: var(--ro-mono); font-size: 11px; letter-spacing: .18em; color: var(--ro-fg-3); text-transform: uppercase; }
.ro-title { font-size: 26px; font-weight: 650; margin: 4px 0 0; letter-spacing: .02em; }
.ro-sub { color: var(--ro-fg-2); margin: 4px 0 0; }
.ro-card { border: 1px solid var(--ro-border); border-radius: var(--ro-radius); padding: 16px 18px; background: var(--ro-surface); }
.ro-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.ro-spread { justify-content: space-between; }
.ro-level { font-family: var(--ro-mono); font-size: 28px; font-weight: 700; }
.ro-bar { height: 6px; border-radius: 3px; background: var(--ro-border); overflow: hidden; flex: 1; min-width: 160px; }
.ro-bar > span { display: block; height: 100%; background: var(--ro-accent); transition: width .4s ease; }
.ro-muted { color: var(--ro-fg-3); font-size: 12px; }
.ro-mono { font-family: var(--ro-mono); }
.ro-section-title { font-size: 13px; font-weight: 600; color: var(--ro-fg-2); margin: 0; }
.ro-quest-title { font-weight: 600; font-size: 15px; }
.ro-badge { font-family: var(--ro-mono); font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.ro-badge[data-tone="ok"] { color: var(--ro-ok); }
.ro-badge[data-tone="warn"] { color: var(--ro-warn); }
.ro-badge[data-tone="err"] { color: var(--ro-err); }
.ro-badge[data-tone="accent"] { color: var(--ro-accent); }
.ro-badge[data-tone="muted"] { color: var(--ro-fg-3); }
.ro-review { margin-top: 8px; padding: 8px 10px; border-left: 2px solid var(--ro-accent); background: var(--ro-hover); border-radius: 4px; }
.ro-file { position: relative; overflow: hidden; display: inline-block; }
.ro-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.ro-proposal { margin: 8px 0 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; color: var(--ro-fg-2); }
.ro-list { margin: 6px 0 0; padding-left: 18px; color: var(--ro-fg-2); }
.ro-btn { font: inherit; font-size: 13px; padding: 5px 14px; border-radius: var(--ro-radius); border: 1px solid var(--ro-border); background: transparent; color: var(--ro-fg); cursor: pointer; }
.ro-btn:hover:not(:disabled) { background: var(--ro-hover); }
.ro-btn:disabled { opacity: .5; cursor: default; }
.ro-btn[data-primary] { border-color: var(--ro-accent); color: var(--ro-accent); }
.ro-form { display: grid; gap: 10px; }
.ro-form label { display: grid; gap: 4px; font-size: 12px; color: var(--ro-fg-2); }
.ro-form .ro-inline { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--ro-fg); }
.ro-grid2 { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.ro-input { font: inherit; font-size: 13px; color: var(--ro-fg); background: transparent; border: 1px solid var(--ro-border); border-radius: var(--ro-radius); padding: 6px 10px; width: 100%; }
.ro-input:focus { outline: 2px solid var(--ro-accent); outline-offset: -1px; }
.ro-error { border-color: var(--ro-err); color: var(--ro-err); }
.ro-strong { font-weight: 600; color: var(--ro-fg); }
.ro-feed { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
.ro-feed li { color: var(--ro-fg-2); }
.ro-feed li[data-unread="true"] { color: var(--ro-fg); }
.ro-link { font: inherit; font-size: 12px; background: none; border: none; color: var(--ro-fg-3); cursor: pointer; margin-left: 8px; padding: 0; text-decoration: underline; }
.ro-track { display: grid; grid-template-columns: minmax(80px, 140px) 1fr auto; gap: 10px; align-items: center; margin-top: 6px; }
.ro-track-name { font-size: 13px; }
.ro-skill { padding: 4px 0 8px; border-bottom: 1px solid var(--ro-border); }
.ro-skill:last-child { border-bottom: none; }
.ro-skill-basis { margin: 6px 0 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.ro-consent { padding: 6px 0; border-bottom: 1px solid var(--ro-border); }
.ro-card[data-hidden="true"] { border-style: dashed; }
.ro-overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(0,0,0,.72); animation: ro-fade .3s ease; cursor: pointer; }
.ro-overlay-box { max-width: min(560px, calc(100vw - 32px)); padding: 28px 32px; border: 1px solid var(--ro-accent); border-radius: var(--ro-radius); background: rgba(10,12,18,.92); color: #e8f0ff; box-shadow: 0 0 40px rgba(77,139,255,.35); }
.ro-line { margin: 6px 0; animation: ro-rise .45s ease both; }
.ro-levelup { text-align: center; }
.ro-level-big { font-family: var(--ro-mono); font-size: 56px; font-weight: 800; letter-spacing: .04em; color: var(--ro-accent); animation: ro-pop .6s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes ro-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ro-rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes ro-pop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
@media (max-width: 560px) {
  .ro-root { padding: 24px 16px 48px; }
  .ro-title { font-size: 22px; }
  .ro-track { grid-template-columns: 1fr auto; }
  .ro-track .ro-bar { grid-column: 1 / -1; grid-row: 2; }
  .ro-consent { flex-direction: column; align-items: flex-start; }
  .ro-mono { word-break: break-all; }
}
@media (prefers-reduced-motion: reduce) { .ro-overlay, .ro-line, .ro-level-big, .ro-bar > span { animation: none; transition: none; } }
.ro-toast { border-color: var(--ro-ok); }
.ro-btn.ro-danger { border-color: var(--ro-err); color: var(--ro-err); }
.ro-persona { border: 1px solid var(--ro-border); border-radius: var(--ro-radius); padding: 8px 12px 10px; display: grid; gap: 6px; margin: 0; }
.ro-persona legend { font-size: 12px; color: var(--ro-fg-2); padding: 0 4px; }
.ro-feed li[data-inactive="true"] .ro-strong { color: var(--ro-fg-3); text-decoration: line-through; }
.ro-audit { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
`
