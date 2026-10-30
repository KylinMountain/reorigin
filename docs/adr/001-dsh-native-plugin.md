# ADR-001 · 优先采用 DSH Native Plugin

**状态**：已决定，运行待验证。

**背景**：需要 AI Agent、模型/会话/MCP/插件生态与沉浸 UI；自建 Runtime 或 Fork Desktop 将增加维护负担。

**决策**：优先使用 DeepSeek Harness 原生插件，侧栏 `sidebar.panellist` + `main` 提供完整工作区；保留原生配置和插件管理。

**备选**：独立 Electron UI；Fork DSH Desktop；复用仅覆盖层 UI。

**验证与复审**：P0 在锁定 commit 上实际验证 Host/Client、Web/Desktop、热重载与插件禁用。失败则重新决策，不直接承诺 Fork。
