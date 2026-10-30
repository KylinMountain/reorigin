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

**v0.2，2026-10-30：设计基线。**

- **P0 已运行验证**（DSH `ce7073d`）：Re:Origin 以原生插件在 Web 与 Desktop 开发构建中提供侧栏入口与完整主工作区，Host/Client RPC、默认落地、自建 Client 构建均已实测；分发方式与签名版 Desktop 仍待验证。详见 [04](04-dsh-integration.md)。
- **P1 首版已实现**：宿主绑定 → 任务 → 证据 → 确定性核验 → XP 幂等结算的闭环，在 DSH Web 上端到端走通。详见 [07](07-implementation.md#p1--最小可信成长闭环)。
- **P2 已实现**：Agent 可通过 `reorigin_propose_quest` 向面板提议任务（宿主审阅后才生效），系统人格、宿主状态与长期记忆注入 prompt；真实模型对话待有 Key 时验证。
- **P3 已实现**：本地 Git 仓库作为授权数据源，提交可作为已佐证证据，确定性规则在免打扰与每日上限内生成隐藏任务与提醒，撤权即停并可删除数据。
- **P4 已实现**：觉醒仪式、升级演出、章节、成长轨迹、系统消息流、可选语音播报与窄屏适配。
- **分发**：tarball 安装已验证。受阻项（需本人）：真实模型对话、签名版 Desktop。详见 [07](07-implementation.md) 与 [08](08-open-questions.md)。

## 原始整合稿

[design-v0.2.md](design-v0.2.md) 保留完整整合版，便于全文阅读与比对。后续原则上维护上述主题文件，并在重要版本发布时更新整合稿。
