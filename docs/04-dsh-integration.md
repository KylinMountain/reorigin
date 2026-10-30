# 04 · DeepSeek Harness 原生插件集成

## 选择 DSH 的原因

Re:Origin 需要 Agent、模型配置、会话、MCP 和插件生态，但这些能力不应由 Re:Origin 重造。首选以 DSH 为 **Runtime + Web/Desktop Shell**，将重生系统作为原生插件工作区加载，不 Fork DSH。技术可行性与版本依赖仍须通过 P0 实测。

## 源码级依据（非运行验证）

根据此前对官方仓库的源码研究：

- `apps/desktop/README.md`：Desktop 是承载 DSH Web 应用的 Electron Shell，并共享 Web Host/插件体系。
- `docs/subsystems/slots.md`：Slots 为带生命周期和作用域的 UI 组合扩展机制，`ctx.slots.inject()` 用于注册。
- `packages/client/ui-sidebar/README.md` 与 `packages/client/ui-sidebar/src/client/contract/slots.ts`：`sidebar.panellist` 注册侧栏入口，选中的 id 与 keyed `main` 主工作区关联。
- `.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.md`：`conversation.content` Factory 是内嵌对话内容的候选方式，而非主工作区的替代品。
- `shell.overlay` 可用于轻量提示，但不是主界面容器。

参考仓库：https://github.com/deepseek-ai/deepseek-harness

## 推荐集成路径

1. DSH 原生插件提供 Host 部分（依赖、业务服务入口）和 Client 部分（React UI 工作区）。
2. 使用 `sidebar.panellist` + `main` 注册 Re:Origin 的侧栏入口和完整系统面板。
3. 可选使用 `shell.overlay` 展示等级升级、奖励核验等小型事件。
4. 若需要与 DSH 对话界面组合，再评估 `conversation.content` Factory；勿凭空假设 API 签名。
5. 插件禁用/卸载时正确释放 Slot、监听与资源；保留 DSH 原生会话、模型和 MCP 入口。

## P0 实测清单

- [x] 钉住 DSH commit，记录 OS/Node/pnpm、版本与启动命令。
- [x] 真实加载最小 Host + Client 插件，验证生命周期。
- [x] 打开 `sidebar.panellist` 对应的 `main` 主工作区。
- [x] 验证应用重启、插件禁用/启用/卸载/重新安装。（插件源码热重载未测）
- [x] 验证 DSH Web 与 Desktop（开发模式）冷启动。
- [x] 验证原生插件管理、模型和会话入口不受损。
- [ ] 验证 Host/Client RPC 契约、构建、打包、发布路径。
- [ ] 验证能否默认启动进入 Re:Origin 面板；不能则明确降级体验。

**判定**：P0 通过后才能将插件接口与发布流程固化为实现规范。未通过时重新评审 UI 集成方案，不直接假定 Fork 是唯一解。

## P0 运行验证记录（2026-10-30）

**结论**：「Re:Origin 作为 DSH 原生插件提供独立侧栏入口 + 完整主工作区」在 Web 与 Desktop（开发构建）上**运行验证通过**，不需要 Fork DSH。RPC、打包发布、默认落地页仍为**待验证**。

样例插件与复现步骤：[`spikes/p0-dsh-plugin`](../spikes/p0-dsh-plugin/README.md)。

### 环境

| 项 | 值 |
|---|---|
| DSH | `deepseek-ai/deepseek-harness@ce7073d51254c26cd63b22a60835b8f948deb447`（`0.2.2-alpha.2`） |
| OS | macOS 27.0.1，arm64 |
| Node / pnpm | 24.21.0 / 11.28.5（corepack） |
| Web | `pnpm dsh --profile p0`，独立 `DSH_HOME`，profile 由 `web` 模板创建 |
| Desktop | `pnpm run start:desktop`（开发构建，状态在 `apps/desktop/.desktop-build/development/`） |

### 结果

| 验证项 | Web | Desktop（开发构建） |
|---|---|---|
| 仓库外第三方包安装（CLI `dsh plugin add <本地目录>`） | 通过 | 未测（Desktop 运行时 CLI 不可写其 profile，见下） |
| 原生「插件 → 添加插件」输入本地目录安装并「立即启用」 | 通过，无需重启 | 通过，无需重启 |
| `sidebar.panellist` 入口 + `main` 主工作区渲染、交互 | 通过 | 通过（[截图](assets/p0/desktop-reorigin-panel.png)） |
| 插件管理页列出该包、开关禁用/启用 | 通过；禁用后入口实时消失，Host 侧 `ctx.effect` 被释放 | 未单独测 |
| 运行中卸载（`dsh plugin remove`） | 通过；入口实时消失，Host 释放，DSH 继续运行 | 未测 |
| 冷重启后保持启用 | 通过 | 通过 |
| 原生入口（插件、自动化任务、会话、工作区）不受影响 | 通过 | 通过 |

### 实测得到的集成事实

- **一个包、一个 Loader 行带两半**：`package.json` 同时声明 `dsh.bundle.patch`（Host 侧，加载 `.` 导出）与 `dsh.client`（`platform: 'web'`，浏览器加载 `./client` 导出）。`dsh.client.inject` 列出需先加载的浏览器包（这里是 `ui-layout`、`ui-sidebar`）。
- **浏览器 bundle 是 DSH 私有格式**：`window.__ModuleLoader__.load({ id: <包名>, factory: (require) => { …CJS…; return module.exports } })`。`require` 只能取到平台共享模块表（`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/cordis`、`zod`、`@deepseek-ai/dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit` 等）。仓库内用 `packages/client/tsdown.client.ts` 生成，**该构建预设未发布**；P0 样例手写此格式，正式实现需自建等价构建步骤。
- **注册方式**：`ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key }, Page))` 与 `ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: key, order, label }, Icon))`，`id` 与 `key` 相同即可配对；`order: 10` 排在「自动化任务」之后。
- **新 profile 的坑**：对不存在的 profile 直接 `dsh plugin add` 会创建只含 `@deepseek-ai/dsh-base` 的无界面 profile；需先 `dsh --profile <名> --from-default-profile web`。
- **Desktop 插件管理**：运行中走应用内插件页（与 Web 共用插件管理器）；CLI 只能在 Desktop 退出后用 Desktop 自带的 `dsh` 命令修改其 profile。
- **网络**：在 HTTP 代理后需 `NODE_USE_ENV_PROXY=1`（corepack/Node fetch 不读 `HTTPS_PROXY`）；Desktop 首次启动需下载锁定的 Node/Python 运行时，`nodejs.org` 不可达时可用镜像文件按 sha256 预置到 `apps/desktop/.desktop-build/downloads/`。

### 仍待验证

- Host/Client RPC（`ctx.remote` / typert Remote）与 Re:Origin Domain Core 的接线。
- 正式构建与分发：npm 包 / `pnpm pack` tarball / GitHub `prepare` 构建三选一；`engines.dsh` 兼容范围策略。
- **打包签名版 Desktop**（运行时 profile 解析，不走开发构建的链接）上的安装与启动。
- 默认启动直接进入 Re:Origin 面板（当前落在「新会话」页；`ctx.layout.selectPanel` 可切换，但是否适合在启动时调用、是否被持久化覆盖未测）。
- 插件源码修改后的热重载开发体验。
- `conversation.content` Factory 内嵌对话。
