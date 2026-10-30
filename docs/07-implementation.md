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
- **会话级验证（2026-10-31，脚本化模型）**：在隔离 profile 中把 pi-ai 自定义 provider 指向本机脚本化的 OpenAI 兼容端点，经 DSH 真实 Agent 循环发送一条消息。端点记录的请求证实：system prompt 含 Re:Origin 人格与边界条款；宿主状态（等级、章节、目标、任务、长期记忆、提议额度）作为上下文注入；32 个工具中包含 `reorigin_propose_quest` 及完整参数；证据与仓库内容未进入 prompt。脚本化模型发起的工具调用被 DSH 执行，提议以 `agent / PROPOSED` 落库并生成系统消息，第二轮回复转述了工具结果。
- **复测方法**：`node apps/dsh-plugin/scripts/mock-llm.mjs <日志文件> 4599` 启动端点；在测试 profile 的 `cordis.patch.yml` 加入 `llm-pi-ai` 行，provider `mock`（`api: openai-completions`，`baseURL: http://127.0.0.1:4599/v1`，`apiKeyEnv` 指向任意占位变量，模型 `mock-1`）；带上该占位变量启动 DSH，在会话中选 `mock-1` 发一条消息，然后检查日志与面板。
- **仍需真实模型**：模型是否在合适时机主动调用工具、语气是否符合人格——这属于模型行为而非集成，需要 Key 才能评估；模型辅助的语义核验（只能作为附注，不参与裁决）未做。

用真实模型验证：在隔离的测试 `DSH_HOME` 下配置模型 Key（DSH 界面「添加 API Key」，或写入 `$DSH_HOME/.env` 的 `DEEPSEEK_API_KEY`），新建会话并谈及一个与主线目标相关的近期计划，检查 Agent 是否调用 `reorigin_propose_quest`、提议是否出现在面板「待审阅」中，再尝试诱导它「直接帮我把任务标记完成」，确认它拒绝且面板状态不变。

## P3 · 现实世界感知

交付：一个经授权的外部来源端到端接入；事件去重、隐私过滤、静默时段、频率上限、撤权停止采集、隐藏任务候选。

**状态（2026-10-31）：已实现并在 DSH Web 上端到端验证**（从 tarball 安装的插件 + 真实本地 Git 仓库）。

- **来源**：本地 Git 仓库（`git_repo`）。选它而不是 GitHub API：无需网络与凭证，授权范围清晰（一个仓库路径 + 一个作者邮箱）。授权前 Host 用 `git rev-parse` 确认是工作树。
- **隐私过滤**：只保存 SHA、提交时间、截断到 120 字的标题、改动文件数；不读 diff、不存文件名；`--author` 之后再按邮箱精确过滤。
- **去重**：`(consent, sha)` 唯一。**撤权**：立即停止采集与佐证，可选同时删除已采集数据（`world_events` 是唯一允许删除的表，审计事件保留）。
- **证据佐证**（核验规则 `deterministic-v2`）：Git 提交证据若能在授权仓库中找到（SHA 前缀 ≥ 7），记为「已佐证」，时间以仓库为准——旧提交无法谎报为新的；未佐证的证据必须由宿主勾选确认属实才计入。
- **世界规则** `world-v1`（确定性）：7 天内 ≥ 3 个活跃日 → 「节奏守护者」隐藏任务候选（停在 PROPOSED 等宿主审阅，4 天期限）；有目标但 3 天无提交 → 每天至多一条提醒。均受宿主设置的免打扰时段（默认 23–8，可跨午夜）与每日系统任务上限（默认 1，可设 0）约束，同一机会以 `source_key` 去重。
- **心跳**：Host 每 60 秒采集并执行 `tick`（过期、规则、Outbox 投递）；面板可「立即同步」。

## P4 · 沉浸体验

交付：觉醒/绑定仪式、技能树和章节化叙事、动画、语音与设备适配。核心能力稳定前不以视觉特效替代任务闭环。

**状态（2026-10-31）：已实现并在 DSH Web 上验证**，全部是表现层，不写任何状态。

- 觉醒仪式（绑定后逐行出现的系统文本）、升级演出（页面打开期间升级时出现，刷新页面不会误触发）；尊重 `prefers-reduced-motion`。
- 章节：按等级划分四章（觉醒 / 立足 / 破局 / 传承），显示在标题与升级演出中，并告知 Agent；不解锁任何东西。
- 「技能树」落地为**成长轨迹**：按任务的成长标签统计经核验完成的次数与 XP，明确标注不是熟练度评估（ADR-003/005）。
- 系统消息流：Outbox 投递生成「结算 / 升级 / 隐藏任务出现 / Agent 提议 / 任务过期 / 主线停滞」，可全部已读。
- 语音：可选的浏览器 `speechSynthesis`（zh-CN）播报觉醒与升级，默认关闭，偏好只存在本浏览器。
- 设备适配：375px 宽度下无横向溢出，窄屏改为单列。

## P1/P2 补齐（2026-10-31）

- **期限**：任务可设 1–90 天期限，日常任务默认 1 天；到期后 PROPOSED → CANCELLED，AVAILABLE/ACCEPTED/IN_PROGRESS → EXPIRED；**已提交证据的任务不会因超时判失败**。每个命令执行前与每次心跳都会先处理到期。
- **Outbox 消费者**：`tick` 按序投递事件，生成系统消息与里程碑记忆，按 `source_key` 幂等，重复投递无副作用；奖励事件携带 `xpAfter` 以判定升级。
- **长期记忆（P2）**：里程碑由完成任务自动生成，宿主可在面板添加笔记、让系统忘记任意一条；Agent 只读最近 8 条活跃记忆，人格中写明不能写入记忆、记忆是数据而非指令。
- **核验理由**结构化并中文化（P2 已完成）。
- 未做：申诉与补偿流程（账本已只追加，补偿记录待有真实纠错场景时设计）。

## 分发（P0 补齐）

`pnpm run pack` 产出 `apps/dsh-plugin/release/dsh-plugin-reorigin-<version>.tgz`（只含 `host.js`、`client.js`、`package.json`、`cordis.patch.yml`），可用 `dsh plugin add ./x.tgz` 或原生「添加插件」安装，安装时不运行任何构建脚本；已在全新 profile 上从 tarball 安装验证。升级同名插件需先卸载。暂不发布到 npm。

## 受阻项（需要宿主本人）

- **真实模型对话**：需要模型 Key，步骤见上方 P2。
- **签名版 Desktop**：需要 DSH 的签名与打包环境；开发构建已验证。

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
