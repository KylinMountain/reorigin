# Re:Origin 设计文档

> **Re:Origin（人生重启系统）**：把现实生活变成有宿主绑定、任务、成长、技能、奖励与世界事件的小说式系统。

项目定位：并非通用 AI Agent、聊天机器人或游戏化 Todo。DSH 提供 Agent Runtime 与原生插件生态，Re:Origin 自己维护可信的现实行动、证据与成长状态。

## 推荐阅读顺序

1. [00-background.md](00-background.md)：项目起源、讨论背景、设计演进及名称由来。
2. [01-vision.md](01-vision.md)：愿景、目标用户体验、非目标及不可偏离的原则。
3. [02-product-design.md](02-product-design.md)：宿主绑定、任务、技能、奖励与任务闭环。
4. [03-architecture.md](03-architecture.md)：技术架构、分层职责和依赖边界。
5. [04-dsh-integration.md](04-dsh-integration.md)：DSH 研究依据、原生插件集成路径与 P0 验证。
6. [05-domain-model.md](05-domain-model.md)：领域模型、任务状态机、命令、事件与一致性。
7. [06-experience-design.md](06-experience-design.md)：小说系统式交互和视觉体验。
8. [07-implementation.md](07-implementation.md)：仓库结构、P0–P4 路线、验收和测试。
9. [08-open-questions.md](08-open-questions.md)：风险、开放问题和验证分级。
10. [adr/README.md](adr/README.md)：架构决策记录。

## 当前状态

**v0.2，2026-10-30：设计基线。** DSH 的插件/Slots 机制有源码级依据，但 Re:Origin 的真实 Web/Desktop 端到端运行尚未完成；具体 Manifest、RPC 签名和打包命令应以 P0 锁定的 DSH 版本为准。

## 原始整合稿

[design-v0.2.md](design-v0.2.md) 保留完整整合版，便于全文阅读与比对。后续原则上维护上述主题文件，并在重要版本发布时更新整合稿。
