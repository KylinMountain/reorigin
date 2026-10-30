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

- [ ] 钉住 DSH commit，记录 OS/Node/pnpm、版本与启动命令。
- [ ] 真实加载最小 Host + Client 插件，验证生命周期。
- [ ] 打开 `sidebar.panellist` 对应的 `main` 主工作区。
- [ ] 验证应用重启、热重载、插件禁用/卸载。
- [ ] 验证 DSH Web 与 Desktop 冷启动。
- [ ] 验证原生插件管理、模型和会话入口不受损。
- [ ] 验证 Host/Client RPC 契约、构建、打包、发布路径。
- [ ] 验证能否默认启动进入 Re:Origin 面板；不能则明确降级体验。

**判定**：P0 通过后才能将插件接口与发布流程固化为实现规范。未通过时重新评审 UI 集成方案，不直接假定 Fork 是唯一解。
