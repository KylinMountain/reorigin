# Re:Origin

人生重启系统：把现实生活中的行动变成有宿主绑定、任务、证据核验与成长反馈的「小说系统」，以原生插件形式运行在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）中。

设计文档从 [docs/README.md](docs/README.md) 开始读。

## Layout

| Path | Role |
|---|---|
| `packages/domain` | Pure domain: Host, Quest state machine, Evidence, deterministic verifier, reward ledger rules. No DSH, React, or model SDK. |
| `packages/application` | Commands (zod-validated), actor rules, idempotent replay, Store/Clock/Id ports. The only way state changes. |
| `packages/infrastructure` | `node:sqlite` (WAL) Store with migrations, append-only audit events, outbox. |
| `apps/dsh-plugin` | DSH bundle: Host service (`reorigin` Remote namespace), the agent tool `reorigin_propose_quest` and System persona, React workspace; `scripts/build.ts` emits `dist/`. |
| `spikes/p0-dsh-plugin` | The P0 feasibility spike, kept for reference. |

## Develop

Requires Node ≥ 24.9 and pnpm 11 (via corepack).

```sh
pnpm install
pnpm test        # vitest: domain + SQLite loop
pnpm typecheck
pnpm build       # → apps/dsh-plugin/dist
```

Run it inside DSH (pinned at `ce7073d`, checked out at `../deepseek-harness`):

```sh
cd ../deepseek-harness
pnpm dsh --profile reorigin --from-default-profile web --dump-config > /dev/null
pnpm dsh plugin --profile reorigin add "$PWD/../reorigin/apps/dsh-plugin/dist"
pnpm dsh --profile reorigin
```

The Host keeps its database at `$DSH_HOME/reorigin/reorigin.db` (default `~/.dsh`). To pick up a rebuilt `dist/` in Desktop, uninstall and reinstall the plugin from its Plugins page.
