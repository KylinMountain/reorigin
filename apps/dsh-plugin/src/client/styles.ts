// The System window: a dark holographic panel in the 系统流 vernacular, scoped
// under .ro-root. It keeps its own palette in both DSH themes on purpose — the
// System is a place you enter, not a settings page.
import { ASSET_ROUTE } from '../shared/remote.ts'

export const STYLES = `
.ro-shell { position: relative; height: 100%; overflow: hidden; }
.ro-root {
  --ro-abyss: #060a13;
  --ro-panel: rgba(12, 22, 42, .78);
  --ro-panel-2: rgba(20, 36, 66, .55);
  --ro-line: #1d3557;
  --ro-line-hi: #3a6fb0;
  --ro-glow: #62e3ff;
  --ro-ink: #dde8ff;
  --ro-dim-c: #8496bb;
  --ro-faint: #4d5f86;
  --ro-gold: #f5c451;
  --ro-ok: #4fe3a2;
  --ro-warn: #ffb35c;
  --ro-err: #ff6b81;
  --ro-num: "DIN Alternate", "Bahnschrift", "DIN Condensed", "Arial Narrow", sans-serif;
  --ro-mono: var(--dsw-font-mono, ui-monospace, Menlo, monospace);
  color-scheme: dark;
  color: var(--ro-ink);
  background:
    radial-gradient(1200px 520px at 50% -180px, rgba(70, 140, 255, .22), transparent 70%),
    linear-gradient(rgba(98, 227, 255, .035) 1px, transparent 1px) 0 0 / 100% 28px,
    linear-gradient(90deg, rgba(98, 227, 255, .035) 1px, transparent 1px) 0 0 / 28px 100%,
    var(--ro-abyss);
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 32px clamp(16px, 4vw, 48px) 72px;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}
.ro-root *, .ro-root *::before, .ro-root *::after { box-sizing: border-box; }
.ro-wrap { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }

/* Frames: square panels with lit corner brackets — the one recurring device. */
.ro-card, .ro-status, .ro-quest {
  position: relative;
  border: 1px solid var(--ro-line);
  background: var(--ro-panel);
  backdrop-filter: blur(6px);
  border-radius: 2px;
  padding: 18px 20px;
}
.ro-card::before, .ro-card::after, .ro-status::before, .ro-status::after {
  content: ""; position: absolute; width: 14px; height: 14px; pointer-events: none;
  border-color: var(--ro-glow); border-style: solid; opacity: .85;
}
.ro-card::before, .ro-status::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
.ro-card::after, .ro-status::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

.ro-sys { margin: 0; color: var(--ro-glow); font-size: 13px; letter-spacing: .06em; text-shadow: 0 0 12px rgba(98, 227, 255, .45); }
.ro-h, .ro-section-title { margin: 0 0 6px; font-size: 15px; font-weight: 600; color: var(--ro-ink); }
.ro-note { margin: 0 0 12px; color: var(--ro-dim-c); font-size: 13px; max-width: 64ch; }
.ro-dim, .ro-muted { color: var(--ro-dim-c); font-size: 12.5px; }
.ro-strong { font-weight: 600; color: var(--ro-ink); }
.ro-mono { font-family: var(--ro-mono); }
.ro-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ro-spread { justify-content: space-between; }
.ro-boot { color: var(--ro-glow); padding: 40px 0; text-align: center; letter-spacing: .1em; animation: ro-blink 1.2s steps(2) infinite; }

/* Generated art. The emblem is light-on-black, so screen blending drops its background. */
.ro-status-emblem, .ro-bind-emblem, .ro-awaken-emblem, .ro-levelup-emblem, .ro-boot-emblem {
  mix-blend-mode: screen; pointer-events: none; user-select: none; border-radius: 50%;
  /* The art's backdrop is deep navy, not black; fade it out so a rotating square never shows. */
  -webkit-mask-image: radial-gradient(circle, #000 58%, transparent 71%);
  mask-image: radial-gradient(circle, #000 58%, transparent 71%);
}
.ro-status-emblem { position: absolute; right: 4px; top: 50%; width: 250px; transform: translateY(-62%); opacity: .3; }
.ro-status > :not(.ro-status-emblem) { position: relative; z-index: 1; }
.ro-root[data-bound="false"] {
  background:
    linear-gradient(180deg, rgba(6, 10, 19, .2), var(--ro-abyss) 92%),
    url(${ASSET_ROUTE}/awakening.jpg) center top / cover no-repeat,
    var(--ro-abyss);
}
.ro-bind { background: rgba(8, 14, 28, .72); }
.ro-bind-emblem { display: block; width: 120px; margin: -8px auto 4px; animation: ro-spin 60s linear infinite; }

/* Boot: the System powers on over its own panel, once per page load. */
.ro-boot-screen {
  position: absolute; inset: 0; z-index: 40; overflow: hidden; cursor: pointer;
  display: grid; place-items: center; background: #03060c; color: #dde8ff;
  font-family: "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif;
  transition: opacity .65s ease;
}
.ro-boot-bg { position: absolute; inset: -4%; background-size: cover; background-position: center 60%; opacity: 0; animation: ro-boot-bg 2.6s cubic-bezier(.2, .7, .2, 1) forwards; }
.ro-boot-screen::after { content: ""; position: absolute; left: 0; right: 0; height: 30%; top: -30%; background: linear-gradient(180deg, transparent, rgba(98, 227, 255, .12), transparent); animation: ro-scan 1.8s .3s ease-in-out 1 both; }
.ro-boot-core { position: relative; z-index: 1; display: grid; justify-items: center; gap: 8px; text-align: center; }
.ro-boot-emblem { width: min(260px, 52vw); opacity: 0; animation: ro-boot-emblem 1.4s cubic-bezier(.2, .9, .25, 1) forwards, ro-spin 40s 1.4s linear infinite; }
.ro-boot-line { margin: 0; font-size: 18px; letter-spacing: .3em; color: #62e3ff; text-shadow: 0 0 18px rgba(98, 227, 255, .7); opacity: 0; animation: ro-rise .5s ease forwards; }
.ro-boot-sub { font-size: 13px; letter-spacing: .12em; color: #a9badc; text-shadow: none; }
.ro-boot-bar { width: 220px; height: 2px; margin-top: 10px; background: rgba(98, 227, 255, .15); overflow: hidden; }
.ro-boot-bar > span { display: block; height: 100%; width: 0; background: #62e3ff; box-shadow: 0 0 10px #62e3ff; animation: ro-boot-load 1.6s cubic-bezier(.3, .6, .3, 1) forwards; }
.ro-boot-bar > span[data-done="true"] { width: 100%; animation: none; transition: width .3s ease; }
.ro-boot-hint { position: absolute; bottom: 20px; margin: 0; font-size: 12px; color: rgba(169, 186, 220, .5); z-index: 1; }
.ro-boot-screen[data-leaving="true"] { opacity: 0; }
.ro-boot-screen[data-leaving="true"] .ro-boot-emblem { animation: ro-boot-exit .65s cubic-bezier(.5, 0, .8, .4) forwards; }

/* Hero: the status window. */
.ro-status {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "id level" "xp xp" "stats stats";
  gap: 14px 24px;
  padding: 26px 28px 22px;
  border-color: var(--ro-line-hi);
  background: linear-gradient(160deg, rgba(30, 60, 110, .55), rgba(10, 18, 36, .85) 60%);
  box-shadow: 0 0 0 1px rgba(98, 227, 255, .06), 0 20px 60px -30px rgba(70, 140, 255, .6);
}
.ro-status-id { grid-area: id; min-width: 0; }
.ro-name { margin: 6px 0 0; font-size: 30px; font-weight: 700; letter-spacing: .04em; }
.ro-title-worn { margin: 2px 0 0; color: var(--ro-gold); font-size: 13px; }
.ro-epigraph { margin: 10px 0 0; color: var(--ro-dim-c); font-size: 13px; max-width: 46ch; }
.ro-status-level { grid-area: level; display: flex; align-items: baseline; gap: 4px; align-self: center; }
.ro-lv { font-family: var(--ro-num); font-size: 22px; color: var(--ro-gold); opacity: .8; }
.ro-level {
  font-family: var(--ro-num); font-size: 96px; line-height: .9; font-weight: 700; color: var(--ro-gold);
  text-shadow: 0 0 28px rgba(245, 196, 81, .35);
  font-variant-numeric: tabular-nums;
}
.ro-xp { grid-area: xp; display: flex; align-items: center; gap: 12px; }
.ro-xp-bar {
  flex: 1; height: 10px; position: relative; overflow: hidden;
  background: rgba(98, 227, 255, .08); border: 1px solid var(--ro-line);
}
.ro-xp-bar > span {
  display: block; height: 100%;
  background: repeating-linear-gradient(90deg, var(--ro-glow) 0 8px, transparent 8px 10px);
  box-shadow: 0 0 12px rgba(98, 227, 255, .6);
  transition: width .6s cubic-bezier(.2, .8, .2, 1);
}
.ro-xp-num { font-family: var(--ro-num); font-size: 15px; color: var(--ro-glow); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ro-stats { grid-area: stats; display: grid; grid-template-columns: repeat(4, 1fr); margin: 0; border-top: 1px solid var(--ro-line); padding-top: 12px; }
.ro-stats > div { padding: 0 4px; }
.ro-stats > div + div { border-left: 1px solid var(--ro-line); padding-left: 16px; }
.ro-stats dt { color: var(--ro-dim-c); font-size: 12px; }
.ro-stats dd { margin: 2px 0 0; font-family: var(--ro-num); font-size: 26px; font-variant-numeric: tabular-nums; }
.ro-stats > div[data-hot="true"] dd { color: var(--ro-gold); text-shadow: 0 0 14px rgba(245, 196, 81, .5); }

/* Tabs. */
.ro-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--ro-line); }
.ro-tab {
  font: inherit; font-size: 14px; color: var(--ro-dim-c); background: none; border: none; cursor: pointer;
  padding: 8px 16px 10px; position: relative; display: inline-flex; align-items: center; gap: 6px;
}
.ro-tab:hover { color: var(--ro-ink); }
.ro-tab[aria-selected="true"] { color: var(--ro-glow); }
.ro-tab[aria-selected="true"]::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; background: var(--ro-glow); box-shadow: 0 0 10px var(--ro-glow); }
.ro-pip { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--ro-gold); color: #1b1300; font-size: 11px; font-weight: 700; display: inline-grid; place-items: center; }

/* Groups and quests. */
.ro-group { display: flex; flex-direction: column; gap: 10px; }
.ro-group-title { margin: 6px 0 0; font-size: 13px; font-weight: 600; color: var(--ro-dim-c); }
.ro-group[data-tone="gold"] .ro-group-title { color: var(--ro-gold); }
.ro-quest { border-left: 3px solid var(--ro-line-hi); padding: 14px 18px; }
.ro-quest[data-tone="ok"] { border-left-color: var(--ro-gold); background: linear-gradient(90deg, rgba(245, 196, 81, .1), var(--ro-panel) 40%); }
.ro-quest[data-tone="err"] { border-left-color: var(--ro-err); }
.ro-quest[data-tone="muted"] { border-left-color: var(--ro-faint); opacity: .8; }
.ro-quest[data-hidden="true"] { border-style: dashed; border-left-style: solid; }
.ro-quest-head { display: flex; align-items: center; gap: 10px; }
.ro-quest-title { margin: 0; font-size: 15.5px; font-weight: 600; flex: 1; min-width: 0; }
.ro-reward { font-family: var(--ro-num); font-size: 16px; color: var(--ro-gold); white-space: nowrap; }
.ro-meter { display: flex; align-items: center; gap: 3px; margin-top: 10px; flex-wrap: wrap; }
.ro-meter > span[data-on] { width: 18px; height: 6px; background: rgba(98, 227, 255, .12); border: 1px solid var(--ro-line); }
.ro-meter > span[data-on="true"] { background: var(--ro-glow); border-color: var(--ro-glow); box-shadow: 0 0 8px rgba(98, 227, 255, .6); }
.ro-meter-label { margin-left: 8px; color: var(--ro-dim-c); font-size: 12px; }
.ro-list { margin: 6px 0 0; padding-left: 18px; color: var(--ro-dim-c); }
.ro-proposal { margin: 8px 0 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; color: var(--ro-dim-c); }
.ro-review { margin-top: 8px; padding: 8px 10px; border-left: 2px solid var(--ro-glow); background: var(--ro-panel-2); }

.ro-tag, .ro-badge {
  font-size: 11.5px; padding: 1px 7px; white-space: nowrap; border: 1px solid currentColor; border-radius: 2px;
  color: var(--ro-glow); background: rgba(98, 227, 255, .06);
}
.ro-tag[data-tone="ok"], .ro-badge[data-tone="ok"] { color: var(--ro-gold); background: rgba(245, 196, 81, .08); }
.ro-tag[data-tone="warn"], .ro-badge[data-tone="warn"] { color: var(--ro-warn); background: rgba(255, 179, 92, .07); }
.ro-tag[data-tone="err"], .ro-badge[data-tone="err"] { color: var(--ro-err); background: rgba(255, 107, 129, .07); }
.ro-tag[data-tone="muted"], .ro-badge[data-tone="muted"] { color: var(--ro-dim-c); background: none; }

/* Detection: the one-click start. */
.ro-detect { border-color: var(--ro-line-hi); background: linear-gradient(120deg, rgba(98, 227, 255, .1), var(--ro-panel) 55%); }
.ro-detect-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; background: var(--ro-line); border: 1px solid var(--ro-line); }
.ro-detect-list li { display: grid; grid-template-columns: 1fr auto; gap: 2px 16px; align-items: center; padding: 10px 14px; background: rgba(8, 14, 28, .9); }
.ro-detect-name { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.ro-detect-scope { display: flex; gap: 14px; flex-wrap: wrap; grid-column: 1; }
.ro-detect-list .ro-btn { grid-column: 2; grid-row: 1 / span 2; }

/* System log. */
.ro-log-list { list-style: none; margin: 4px 0 0; padding: 0; font-size: 13px; }
.ro-log-list li { display: grid; grid-template-columns: 64px auto 1fr; gap: 10px; padding: 6px 0; border-bottom: 1px dashed rgba(29, 53, 87, .8); align-items: baseline; }
.ro-log-list li:last-child { border-bottom: none; }
.ro-log-list time { color: var(--ro-faint); font-size: 12px; font-variant-numeric: tabular-nums; }
.ro-log-title { color: var(--ro-glow); white-space: nowrap; }
.ro-log-list li[data-kind="observed"] .ro-log-title { color: var(--ro-dim-c); }
.ro-log-list li[data-unread="true"] .ro-log-title { color: var(--ro-gold); }
.ro-log-body { color: var(--ro-ink); min-width: 0; overflow-wrap: anywhere; }
.ro-log-list li[data-kind="observed"] .ro-log-body { color: var(--ro-dim-c); }

/* Templates. */
.ro-templates { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 6px 0 10px; }
.ro-template {
  font: inherit; text-align: left; cursor: pointer; color: var(--ro-ink);
  display: grid; gap: 2px; padding: 12px 14px;
  background: var(--ro-panel-2); border: 1px solid var(--ro-line); border-radius: 2px;
}
.ro-template:hover:not(:disabled) { border-color: var(--ro-glow); box-shadow: inset 0 0 0 1px rgba(98, 227, 255, .3); }
.ro-template:disabled { cursor: default; opacity: .55; }
.ro-template-label { font-weight: 600; }
.ro-custom { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ro-line); }

/* Sources. */
.ro-consents { list-style: none; margin: 0 0 10px; padding: 0; }
.ro-consents li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid var(--ro-line); }
.ro-consents li[data-active="false"] { opacity: .6; }
.ro-consent-ref { font-family: var(--ro-mono); font-size: 12.5px; flex: 1; min-width: 0; overflow-wrap: anywhere; }

/* Controls. */
.ro-btn {
  font: inherit; font-size: 13px; padding: 6px 16px; cursor: pointer; border-radius: 2px;
  border: 1px solid var(--ro-line-hi); background: rgba(98, 227, 255, .04); color: var(--ro-ink);
}
.ro-btn:hover:not(:disabled) { border-color: var(--ro-glow); background: rgba(98, 227, 255, .1); }
.ro-btn:disabled { opacity: .45; cursor: default; }
.ro-btn[data-primary] { border-color: var(--ro-glow); color: #04121c; background: var(--ro-glow); font-weight: 600; box-shadow: 0 0 16px rgba(98, 227, 255, .35); }
.ro-btn[data-primary]:hover:not(:disabled) { background: #8debff; }
.ro-quest[data-tone="ok"] .ro-btn[data-primary] { background: var(--ro-gold); border-color: var(--ro-gold); color: #1b1300; box-shadow: 0 0 18px rgba(245, 196, 81, .45); }
.ro-btn-quiet { border-color: var(--ro-line); background: none; color: var(--ro-dim-c); }
.ro-btn.ro-danger { border-color: var(--ro-err); color: var(--ro-err); background: none; }
.ro-link { font: inherit; font-size: 12.5px; background: none; border: none; color: var(--ro-glow); cursor: pointer; padding: 0; margin-top: 4px; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(98, 227, 255, .4); align-self: flex-start; }
.ro-root :focus-visible { outline: 2px solid var(--ro-glow); outline-offset: 2px; }
.ro-form { display: grid; gap: 12px; }
.ro-form label { display: grid; gap: 4px; font-size: 12px; color: var(--ro-dim-c); }
.ro-form .ro-inline, .ro-check, .ro-form label.ro-check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--ro-ink); }
.ro-check input { margin-top: 4px; accent-color: var(--ro-glow); }
.ro-grid2 { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.ro-input { font: inherit; font-size: 13px; color: var(--ro-ink); background: rgba(4, 8, 18, .7); border: 1px solid var(--ro-line); border-radius: 2px; padding: 7px 10px; width: 100%; }
.ro-input:focus { outline: 1px solid var(--ro-glow); border-color: var(--ro-glow); }
.ro-file { position: relative; overflow: hidden; display: inline-block; }
.ro-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.ro-persona { border: 1px solid var(--ro-line); padding: 8px 12px 10px; display: grid; gap: 6px; margin: 0; }
.ro-persona legend { font-size: 12px; color: var(--ro-dim-c); padding: 0 4px; }
.ro-flash { border: 1px solid var(--ro-ok); color: var(--ro-ok); background: rgba(79, 227, 162, .08); padding: 10px 14px; font-size: 13px; }
.ro-flash[data-tone="err"] { border-color: var(--ro-err); color: var(--ro-err); background: rgba(255, 107, 129, .08); }

/* Binding. */
.ro-bind { margin-top: 8vh; padding: 32px; border-color: var(--ro-line-hi); }
.ro-bind-title { margin: 6px 0 4px; font-size: 26px; font-weight: 700; letter-spacing: .04em; }

/* Secondary cards (growth, achievements, memories, audit). */
.ro-feed { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.ro-feed li { color: var(--ro-dim-c); }
.ro-feed li[data-inactive="true"] .ro-strong { color: var(--ro-faint); text-decoration: line-through; }
.ro-audit { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.ro-track { display: grid; grid-template-columns: minmax(80px, 140px) 1fr auto; gap: 10px; align-items: center; margin-top: 6px; }
.ro-track-name { font-size: 13px; }
.ro-bar { height: 6px; background: rgba(98, 227, 255, .08); border: 1px solid var(--ro-line); overflow: hidden; flex: 1; min-width: 120px; }
.ro-bar > span { display: block; height: 100%; background: var(--ro-glow); }
.ro-skill { padding: 6px 0 10px; border-bottom: 1px solid var(--ro-line); }
.ro-skill:last-child { border-bottom: none; }
.ro-skill-basis { margin: 6px 0 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }

/* Overlays: awakening and level-up. */
.ro-overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(2, 5, 12, .8); animation: ro-fade .3s ease; cursor: pointer; }
.ro-awaken { background-color: #03060c; background-size: cover; background-position: center 60%; }
.ro-awaken-emblem { position: absolute; width: min(420px, 80vw); opacity: .45; animation: ro-boot-emblem 1.6s cubic-bezier(.2, .9, .25, 1) both, ro-spin 50s linear infinite; }
.ro-awaken .ro-overlay-box { position: relative; background: rgba(4, 9, 20, .72); backdrop-filter: blur(4px); }
.ro-levelup-emblem { display: block; width: 140px; margin: -12px auto 0; animation: ro-spin 24s linear infinite; }
.ro-overlay-box { max-width: min(560px, calc(100vw - 32px)); padding: 28px 32px; border: 1px solid var(--ro-glow); background: rgba(8, 16, 32, .94); color: var(--ro-ink); box-shadow: 0 0 60px rgba(98, 227, 255, .3); }
.ro-line { margin: 6px 0; animation: ro-rise .45s ease both; }
.ro-levelup { text-align: center; }
.ro-level-big { font-family: var(--ro-num); font-size: 72px; font-weight: 800; color: var(--ro-gold); text-shadow: 0 0 30px rgba(245, 196, 81, .5); animation: ro-pop .6s cubic-bezier(.2, 1.6, .4, 1) both; }
.ro-kicker { font-size: 12px; letter-spacing: .1em; color: var(--ro-glow); }

@keyframes ro-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ro-rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes ro-pop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
@keyframes ro-blink { 50% { opacity: .4 } }
@keyframes ro-spin { to { rotate: 360deg } }
@keyframes ro-boot-bg { from { opacity: 0; transform: scale(1.12); filter: brightness(.4) } to { opacity: .9; transform: scale(1); filter: brightness(1) } }
@keyframes ro-boot-emblem { from { opacity: 0; transform: scale(.55) rotate(-40deg); filter: blur(6px) } 70% { opacity: 1; filter: blur(0) } to { opacity: 1; transform: none } }
@keyframes ro-boot-exit { to { opacity: 0; transform: scale(2.2); filter: blur(4px) } }
@keyframes ro-boot-load { from { width: 0 } to { width: 82% } }
@keyframes ro-scan { from { top: -30% } to { top: 110% } }
/* The single orchestrated moment: the status window powers on. */
@keyframes ro-power { from { opacity: 0; clip-path: inset(48% 0 48% 0); } 60% { opacity: 1; clip-path: inset(0 0 0 0); } to { opacity: 1; } }
.ro-status { animation: ro-power .7s cubic-bezier(.2, .8, .2, 1) both; }

@media (max-width: 600px) {
  .ro-root { padding: 20px 16px 48px; }
  .ro-status { grid-template-areas: "id level" "xp xp" "stats stats"; padding: 20px 18px; gap: 12px; }
  .ro-name { font-size: 22px; }
  .ro-level { font-size: 64px; }
  .ro-stats { grid-template-columns: repeat(2, 1fr); row-gap: 10px; }
  .ro-stats > div + div { border-left: none; padding-left: 4px; }
  .ro-tab { padding: 8px 10px 10px; }
  .ro-log-list li { grid-template-columns: 1fr; gap: 0; }
  .ro-detect-list li { grid-template-columns: 1fr; }
  .ro-detect-list .ro-btn { grid-column: 1; grid-row: auto; justify-self: start; margin-top: 6px; }
  .ro-track { grid-template-columns: 1fr auto; }
  .ro-track .ro-bar { grid-column: 1 / -1; grid-row: 2; }
  .ro-quest-head { flex-wrap: wrap; }
  .ro-status-emblem { width: 170px; right: -10px; }
}
@media (prefers-reduced-motion: reduce) {
  .ro-status, .ro-overlay, .ro-line, .ro-level-big, .ro-xp-bar > span, .ro-boot,
  .ro-bind-emblem, .ro-awaken-emblem, .ro-levelup-emblem { animation: none; transition: none; }
}
`
