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
.ro-toast { border-color: var(--ro-ok); }
`
