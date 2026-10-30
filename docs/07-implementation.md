# 07 · 工程实施计划与验收

## 推荐技术栈

TypeScript + React + SQLite WAL + pnpm Monorepo。Re:Origin Domain Core 独立于 DSH；插件 Manifest、Host/Client RPC、打包命令必须以 P0 的实际运行结果为准。

```text
reorigin/
  apps/dsh-plugin/src/{host,client}
  packages/domain/{host,quest,evidence,growth,reward,world,consent}
  packages/application/{commands,queries,event-handlers}
  packages/infrastructure/{sqlite,migrations,outbox}
  packages/dsh-adapter/{agent,tools,ui}
  packages/contracts/{commands,events,schemas}
  tests/{domain,integration,e2e}
  docs/
```

**P1 实际落地的结构**（2026-10-30）：先建 `packages/domain`、`packages/application`、`packages/infrastructure`、`apps/dsh-plugin` 四个包；`contracts` 暂并入 `application`（命令 Schema、端口、事件类型），`dsh-adapter` 暂并入 `apps/dsh-plugin`（Host 服务 + 客户端）。出现第二个消费方（例如 Agent 工具）时再拆出。测试放在各包 `test/` 下而非顶层 `tests/`。

## P0 · DSH 原生插件可行性 Spike

交付：固定 DSH SHA、最小 Host/Client 插件、侧栏入口和完整面板、安装/启动/卸载指南、Web 与 Desktop 冷启动证据、插件管理和模型/会话功能回归。未完成前不宣称 Desktop 兼容。

## P1 · 最小可信成长闭环

交付：Host 绑定、Quest 接受、人工证据提交、确定性核验、XP 幂等结算、审计、SQLite 重启恢复。验收时至少完成一次真实可追溯任务；重复提交不得重复发奖。

**状态（2026-10-30）：首版实现并在 DSH Web 上端到端走通**，Desktop 开发构建验证了绑定与持久化。

- 已实现：`BindHost`、`ProposeQuest`、`AcceptQuest`、`CancelQuest`、`SubmitQuestEvidence`、`VerifyQuest`、`SettleQuest`；状态机按 05 章；确定性核验 `deterministic-v1`（证据类型与数量、观测时间不早于接受时间、同一内容哈希不跨任务复用、亲述证据须宿主确认、他人证据直接驳回）；XP 幂等键 `host:quest:xp-v1:xp`（库内唯一约束）；按 `commandId` 重放；单事务写入状态 + 审计事件 + Outbox + 命令结果；事件表与奖励账本由触发器保证只追加；`PRAGMA user_version` 迁移。
- Agent 只能 `ProposeQuest`（停在 PROPOSED 待宿主审阅）；浏览器 RPC 一律按宿主身份执行，客户端声明的 `actor` 被覆盖。
- 测试（`pnpm test`）：领域状态机/核验/等级，SQLite 上的完整闭环、补证、证据复用、Agent 越权、输入校验、失败回滚、只追加约束，以及 400 步随机命令序列（含命令重放）下「每个任务至多入账一次、XP 不超过已完成任务价值」的性质测试。
- 尚未做：Outbox 消费者（目前只写不投递）、`RevokeConsent`（随 P3 数据源一起做）、期限与 `EXPIRED`、核验理由本地化、申诉与补偿流程。

## P2 · Agent、人格与长期记忆

交付：受控任务建议、人格与长期记忆接入、Schema 验证、提示注入与模型越权防护。模型只能调用业务命令，不可改写领域数据库。

## P3 · 现实世界感知

交付：一个经授权的外部来源端到端接入；事件去重、隐私过滤、静默时段、频率上限、撤权停止采集、隐藏任务候选。

## P4 · 沉浸体验

交付：觉醒/绑定仪式、技能树和章节化叙事、动画、语音与设备适配。核心能力稳定前不以视觉特效替代任务闭环。

## 验收与测试矩阵

- **Domain 单测**：合法/非法状态转换、授权、重复命令、规则版本、奖励唯一性。
- **性质测试**：任意命令重试不重复加 XP；无有效 Verification 无法完成。
- **SQLite 集成**：事务失败回滚、Outbox 重放、重启恢复与 schema migration。
- **DSH 集成**：插件生命周期、Slot 释放、RPC 与升级兼容。
- **Agent 对抗**：Prompt injection、伪造证据、权限越权、模型直接发奖尝试。
- **Desktop E2E**：Web/Desktop 启动、热重载、禁用、卸载后不损害 DSH。
- **隐私测试**：撤权阻断采集、用户可查看和删除个人数据。

## Gate

- P0：插件实际运行并有复现步骤，Web/Desktop 测试结果公开记录。
- P1：真实任务 → 可验证证据 → 一次性结算 → 重启持久化全通过。
- P2：模型不能越过领域裁决。
- P3：无授权不采集，撤权可生效。
