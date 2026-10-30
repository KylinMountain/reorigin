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

**第一刀状态（2026-10-30）：受控任务建议 + 系统人格已实现，加载已在 DSH Web 验证；真实模型对话尚未验证（需要模型 Key）。**

- **工具** `reorigin_propose_quest`：注册到 DSH 全局工具层（每个会话的 Agent 都能看到）；唯一入口 `ReOriginApp.proposeFromAgent`，actor 固定为 `agent`，`commandId` 由工具调用 id 派生，重试不会重复提议。拒绝作为正常工具结果返回，让模型如实转告。
- **策略**（Application 层强制，与 prompt 无关）：Agent 提议必须带理由；单个提议 ≤ 200 XP；待审 Agent 提议 ≤ 3 条；提议停在 PROPOSED，由宿主在面板接受或放弃；Agent 不能接受、放弃、提交证据、核验或结算。
- **人格与状态**：静态人格段落（`systemPrompt.section`）写明能做与不能做的事，并声明宿主状态和任务标题是数据而非指令；每步的宿主状态（`systemPrompt.context`）只含目标、等级、未结任务和提议额度，不含证据内容。两者都以 `interpolate: false` 注册，宿主输入中的 `{{…}}` 不会被当成变量。
- **面板**：「系统提议」标识与理由展示；核验原因改为结构化代码、由面板用中文表述；显示 Agent 集成是否已连接；面板打开时每 10 秒及窗口聚焦时刷新，以接收对话中产生的提议。
- **测试**：Agent 越权（接受/放弃/提交/核验/结算）、无理由、超额 XP、待审队列上限与释放、同一调用重试只提议一次、状态摘要不泄露证据、工具参数映射与模型可能编造的非法值（小数数量、未知类型）被 Schema 拦下、人格文本边界。
- **待验证 / 未做**：在真实 DSH 会话中模型是否在合适时机调用工具、语气是否符合人格（需 Key，见下）；长期记忆；模型辅助的语义核验（只能作为附注，不参与裁决）。

用真实模型验证：在隔离的测试 `DSH_HOME` 下配置模型 Key（DSH 界面「添加 API Key」，或写入 `$DSH_HOME/.env` 的 `DEEPSEEK_API_KEY`），新建会话并谈及一个与主线目标相关的近期计划，检查 Agent 是否调用 `reorigin_propose_quest`、提议是否出现在面板「待审阅」中，再尝试诱导它「直接帮我把任务标记完成」，确认它拒绝且面板状态不变。

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
