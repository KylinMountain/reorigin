# P0 spike: Re:Origin as a native DSH plugin

Throwaway proof that an out-of-tree package can add a sidebar entry and a full
main workspace to DeepSeek Harness. Results and status live in
[docs/04-dsh-integration.md](../../docs/04-dsh-integration.md); this file only
describes the package and how to reproduce the run.

## What the package contains

| File | Role |
|---|---|
| `package.json` | Declares `dsh.bundle` (the patch layer) and `dsh.client` (the browser half) in one package. |
| `cordis.patch.yml` | Inserts a single Loader row `reorigin` → `dsh-plugin-reorigin`. |
| `host.js` | Host half; logs load/dispose to prove lifecycle. |
| `client.js` | Browser half, hand-written in DSH's `window.__ModuleLoader__.load({ id, factory })` closure format. Registers `sidebar.panellist` id `reorigin` and the keyed `main` panel `reorigin`. |

No build step: both halves are plain JavaScript. `react` comes from the
injected `require`, which only answers DSH's platform module table.

## Reproduce (Web)

Pinned DSH: `deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447`
(`0.2.2-alpha.2`), checked out beside this repository at `../deepseek-harness`.

```sh
cd ../deepseek-harness
pnpm install                 # behind an HTTP proxy, also export NODE_USE_ENV_PROXY=1
pnpm run build:artifacts

export DSH_HOME=/tmp/reorigin-p0-home          # keep the run away from ~/.dsh
pnpm dsh --profile p0 --from-default-profile web --dump-config > /dev/null
pnpm dsh plugin --profile p0 add "$PWD/../reorigin/spikes/p0-dsh-plugin"
pnpm dsh --profile p0 --no-open                # prints http://127.0.0.1:3080/?token=...
```

Create the profile from the `web` template first: `dsh plugin add` on a profile
that does not exist yet initializes it with `@deepseek-ai/dsh-base` only, which
has no Web surface.

The Plugins page (**插件 → 添加插件**) also accepts the same local directory path.

## Reproduce (Desktop, development build)

```sh
cd ../deepseek-harness
pnpm run start:desktop       # needs the Electron binary and the locked Node/Python runtime downloads
```

Development state lives under `apps/desktop/.desktop-build/development/`, away
from `~/.dsh`. In the window, open **插件 → 添加插件**, enter the absolute path
of this directory, then **立即启用**. The Re:Origin entry appears without a
restart and survives quitting and relaunching.

If `nodejs.org` is unreachable, download the same archive from a mirror and
save it as `apps/desktop/.desktop-build/downloads/<sha256>`, using the
`nodeSha256` from `scripts/primary-runtime/lock.json`; the downloader checks the
hash before using a cached file.
