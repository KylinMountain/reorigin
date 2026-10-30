# Re:Origin｜人生重启系统

> 产品愿景、讨论背景、设计演进、技术架构与实施路线（v0.2，2026-10-30）

**状态：设计基线。** DSH 集成需要 P0 运行验证。本文件整合分章节文档，后续以分章节版本为主要维护对象。

## 目录

- [00-background.md](./00-background.md)
- [01-vision.md](./01-vision.md)
- [02-product-design.md](./02-product-design.md)
- [03-architecture.md](./03-architecture.md)
- [04-dsh-integration.md](./04-dsh-integration.md)
- [05-domain-model.md](./05-domain-model.md)
- [06-experience-design.md](./06-experience-design.md)
- [07-implementation.md](./07-implementation.md)
- [08-open-questions.md](./08-open-questions.md)



---

# 00 · 项目起源与设计演进

## 起点：现实版「重生流 / 系统流小说」

Re:Origin 的起点是一个产品问题：**能否把小说中「系统绑定宿主」的体验真正带到现实生活？** 在小说里，系统能感知宿主、发布主线或隐藏任务，评价行动、解锁技能和奖励，并持续改变角色的成长轨迹。如今 AI 能理解语言、使用工具、连接外部数据，但多数产品仍以被动问答为中心。

我们希望宿主不是向 AI 下单的操作者，而是拥有连续人生轨迹的主角。系统作为长期伙伴，负责观察、提出挑战、提供帮助、验证与反馈；真实行动仍由宿主决定和完成。

「重生」是叙事隐喻：人生不能倒带，但从此刻可以开启新篇章。产品不承诺重写现实，也不将游戏等级混同于真实能力。

## 为什么不是一般的 AI Agent 或 Todo

普通 Agent 的重点是完成用户委派任务；Todo 的重点是记录待办。Re:Origin 关注的是 **宿主长期成长的闭环**：现实上下文 → 任务提议 → 宿主接受 → 真实行动 → 证据核验 → 成长结算 → 后续状态变化。没有证据、状态和持续反馈，就只剩一个会聊天的任务清单。

## 方案演进

| 阶段 | 候选方案 | 取舍与结论 | 状态 |
|---|---|---|---|
| A | 自建完整 AI Agent 平台 | 模型路由、工具、会话、插件等重复建设成本高 | 不作为首选 |
| B | DSH 做 Agent Runtime | 复用成熟 Agent 能力，领域引擎独立 | 已决定方向 |
| C | 独立 Electron UI / Fork DSH Desktop | UI 自由度高，但维护、同步与生态兼容成本高 | 暂不采用 |
| D | DSH Native UI Plugin | 通过原生 Slots 提供系统工作区，并保留 DSH 插件能力 | 首选，运行待验证 |
| E | 独立 Domain Core + DSH Adapter | 便于测试、升级与未来替换运行时 | 架构原则 |

## 命名演进

曾考虑 `OpenDots`（与 OpenAI Dots 及其他同名项目易混淆）、`Reborn`（重生语义直接但通用）、`ReSystem`（直指小说里的系统）。最终采用 **Re:Origin**：重启原点、从当下重写下一篇章。仓库与包名使用 `reorigin`（不包含冒号）。品牌商标、域名是否可用尚未核验。

## 对后续实现者最重要的一点

不能因为 DSH 已提供聊天界面，就把 Re:Origin 实现为聊天插件加任务列表。**持续的宿主状态、现实证据、任务裁决与奖励账本是产品核心；剧情化系统体验是交互核心。**



---

# 01 · 产品愿景与设计原则

## 愿景

Re:Origin 是现实世界中的小说式「人生重启系统」。用户作为 **Host（宿主）** 与系统绑定，获得有连续性的任务、成长与世界反馈；系统帮助用户认识机会、形成行动与积累经验，但不替用户决定人生。

> 人生没有真正的存档或读档，但可以从现在开始，开启自己的第二篇章。

## 核心体验目标

- **系统存在感**：系统具有稳定人格、启动与绑定仪式、世界事件及主动但克制的反馈。
- **主线与支线**：与宿主长期目标和真实情境相关，支持隐藏任务及阶段性突破任务。
- **可信成长**：任务完成需要证据；经验值、成就、技能熟练度彼此区分。
- **长期连续性**：状态与经验持久保存，不依赖单次对话上下文。
- **宿主主权**：可拒绝任务、撤销授权、关闭主动提醒和处理个人数据。

## 不可偏离的原则

1. **现实先于叙事**：沉浸式表达不得覆盖证据不足或模型不确定性。
2. **宿主保有决定权**：任务可接受、拒绝、暂停与取消；外部操作需单独授权。
3. **模型提议，领域核心裁决**：LLM 不得直接写入事实、变更任务最终状态或发放奖励。
4. **经验值不等于实际能力**：技能评估须保留依据、范围和不确定性。
5. **长期状态独立于聊天历史**：通过可审计事件、持久化与版本化规则维护。
6. **最小权限、可撤回**：来源授权、主动性、数据保留与删除可控。
7. **运行时可替换**：DSH 是首选 Runtime，不是业务事实源。

## 非目标（MVP）

MVP 不开发新的 Agent 基础设施，不将产品简化为打卡 Todo，不部署未经许可的数据监听，不实现真实货币奖励、自动消费、复杂多人社交、可穿戴硬件或多设备冲突同步。以上能力若未来需要，应单独评估权限、伦理、成本和架构边界。



---

# 02 · 产品与领域体验设计

## Host · 宿主

绑定流程记录宿主目标、偏好、授权范围与系统人格选择。宿主资料、长期目标和行为历史可更新、追溯和删除。系统展示的游戏属性（等级、XP、成就）不能冒充现实中的客观能力；真实技能应有证据支持和适用范围。

## Quest · 任务体系

任务类型包括：**Main（主线）**、**Side（支线）**、**Daily（日常）**、**Hidden（隐藏）** 和 **Breakthrough（突破）**。每个任务至少具有来源、目标、验收条件、完成期限或有效范围、证据需求、奖励规则版本与接受状态。隐藏任务也必须遵守宿主授权和可拒绝原则。

## Growth · 成长系统

将 XP 与技能熟练度分开：XP 是游戏体验的累计反馈；熟练度是针对特定技能、在明确范围内基于证据的评估。评估保留证据引用、置信度及重评机制。成就和等级提供仪式感，但不允许模型凭空宣布现实成长。

## Reward · 奖励

支持 XP、徽章、称号、章节或技能树解锁。奖励依据版本化规则通过幂等账本入账；多次提交或系统重试不得重复结算。涉及真实权益、外部付款、代用户行动的奖励不在 MVP 范围。

## World · 现实世界

从用户已授权的数据源观察与宿主目标相关的事件（例如 GitHub 的实际提交、日历中用户允许访问的事项），经过隐私过滤与去重后产生任务候选。系统应支持免打扰、频率上限与来源撤权。

## Persona · 系统人格

人格由基础叙事语气、宿主情境、世界状态和交互政策组成。可以说「系统检测到潜在突破任务」，但应明确任务来自什么事件或模型建议，不能伪造观测与奖励。

## 关键用户旅程（最小闭环）

1. 用户启动应用，完成系统觉醒与宿主绑定。
2. 用户声明一个真实目标；系统依据目标和现有信息提出候选任务。
3. 宿主查看验收标准后接受任务。
4. 宿主在现实中完成行动并提交证据（例如提交记录或测试报告）。
5. Evidence Engine 核验来源、时间、完整性与重复使用，并要求补证或拒绝不充分证据。
6. Quest Engine 完成任务，Reward Engine 幂等结算，Growth Engine 有条件更新技能评估。
7. 系统更新宿主成长轨迹，后续建议可参考历史表现但不能编造事实。

## MVP 示例

「为某个项目模块补充回归测试」：完成标准可以是测试文件、可复现的运行结果与关联 commit；核验不能只凭模型一句「看起来做完了」。这是示例任务，不意味着系统默认读取用户仓库。



---

# 03 · 总体技术架构

```text
Re:Origin UI (DSH Native Client Plugin)
  ├─ 系统终端 / 宿主面板 / 任务 / 技能树 / 成就 / 审计
  └─ DSH UI Slots: sidebar.panellist + main; shell.overlay
                    │ typed commands / queries
                    ▼
Application Layer ───────── Domain Core
  ├─ Host Engine         ├─ Quest Engine
  ├─ Evidence Engine     ├─ Growth Engine
  ├─ Reward Engine       ├─ World Engine
  └─ Persona / Memory    └─ Consent / Policy
                    │ ports
         ┌──────────┴──────────┐
         ▼                     ▼
 SQLite WAL + Outbox    DSH Adapter (Agent/Tools/Sessions)
         ▲                     │
         └──── Authorized External Sources ────┘
```

## 边界与职责

**DSH** 负责模型接入/路由、Agent 会话、工具、MCP、插件生命周期和 Web/Desktop Shell。**Re:Origin Core** 负责宿主身份、任务状态、证据核验、成长、奖励、权限和审计。**Adapter** 转换工具结果为有来源的领域事实、向 Agent 暴露受控命令；**UI** 显示查询结果并提交命令，不作为事实源。

## 依赖与隔离

`dsh-plugin / dsh-adapter → application → domain`；`infrastructure → domain ports`。Domain Core 不依赖 DSH、React、Electron 或模型厂商。严禁 Agent 直写 SQLite、任意修改奖励账本，严禁前端仅凭本地缓存宣布任务已完成。

## 持久化与一致性

本地优先 SQLite WAL。关键写入采用事务记录聚合状态和只追加事件；跨组件副作用经 Outbox 可靠投递，消费端以 `event_id`/业务幂等键去重。与外部资源交互采用至少一次送达假设，不能假设工具成功即代表业务完成。数据恢复须通过重启、重复命令、异常退出测试。

## 安全、授权、隐私

数据采集之前校验 Consent；撤权后停止新的采集；外部修改或支付必须另行明确授权。用户可查看证据来源、奖励原因、历史审计以及导出/删除数据。故事叙事与事实界面应能清晰区分。



---

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



---

# 05 · 领域模型、状态机与数据契约

## 领域对象

| 对象 | 关键字段 | 不变量 |
|---|---|---|
| Host | id, profile, goals, preferences | 绑定可追踪，个人信息可撤回 |
| Quest | id, host_id, type, criteria_version, status | 状态转换必须合法 |
| QuestEvent | id, quest_id, type, at, actor | 只追加的审计历史 |
| Evidence | id, source, ref, observed_at, recorded_at, hash | 源可追、时间可核对、可去重 |
| Verification | evidence_id, verdict, rule_version, reason | 模型意见不等于最终裁决 |
| SkillAssessment | skill_id, level, confidence, evidence_ids | 有来源、有边界、可复评 |
| RewardLedger | id, quest_id, rule_version, amount, key | 幂等且可审计 |
| WorldEvent | source, observed_at, payload_ref | 只能来自已授权数据源 |
| Consent | scope, source, granted_at, revoked_at | 撤销后阻止新采集 |

推荐持久化表：`hosts`、`host_goals`、`quests`、`quest_events`、`evidence`、`verifications`、`skills`、`skill_assessments`、`reward_ledger`、`world_events`、`system_memories`、`consents` 和 `outbox`。具体模式由 P1 migration 固化。

## Quest 状态机

```text
PROPOSED → AVAILABLE → ACCEPTED → IN_PROGRESS → SUBMITTED → VERIFYING
                                                           ├─→ COMPLETED
                                                           ├─→ NEEDS_EVIDENCE → SUBMITTED
                                                           └─→ REJECTED
AVAILABLE / ACCEPTED / IN_PROGRESS → CANCELLED 或 EXPIRED（受策略约束）
```

`COMPLETED` 必须具备有效核验结果。拒绝、过期和撤销均不得产生伪完成奖励。终态后的纠错应通过显式申诉、补偿事件与审计记录，而非悄悄覆盖历史。

## 命令

`BindHost`、`ProposeQuest`、`AcceptQuest`、`SubmitQuestEvidence`、`VerifyQuest`、`SettleQuest`、`RevokeConsent`。

命令至少具有 `command_id`、`actor`、`host_id`、`issued_at`、`schema_version`；handler 负责鉴权、状态转换、持久化与幂等。

## 领域事件

`host.bound.v1`、`quest.proposed.v1`、`quest.accepted.v1`、`quest.evidence_submitted.v1`、`quest.verified.v1`、`quest.completed.v1`、`reward.granted.v1`、`skill.assessed.v1`、`world.event_observed.v1`。

事件包含 `event_id`、`aggregate_id`、`occurred_at`、`causation_id`、`correlation_id` 和 `schema_version`；消费者必须幂等并对未知版本安全失败。

## 证据核验与公平性

核验优先级：**确定性规则与可验证外部工具结果 > 经确认的人工证据 > 模型辅助语义评估**。必须保留 `observed_at` 与 `recorded_at` 两类时间，防止事后信息伪装成当时观测。证据重复使用有明确策略；争议可申诉，账本通过补偿修正。

## 奖励结算

建议奖励幂等键为 `host_id + quest_id + reward_rule_version + reward_type`。XP 和徽章受 Reward Engine 裁决；Growth Engine 才能维护真实技能的有证据评估。事件和账本与 Quest 状态写入必须具有可恢复的一致性协议。



---

# 06 · 沉浸式体验与交互设计

## 核心叙事

**「系统已觉醒，检测到符合条件的宿主。是否开启人生第二周目？」** Re:Origin 的默认入口应是「系统终端」，而非普通 SaaS 数据看板。用户可通过系统的层级、状态和情境反馈感知「这个系统一直在」。但所有沉浸式内容必须能追溯现实事实，禁止伪造能力、任务或外部事件。

## 首次绑定

启动动画 → 系统身份说明 → 关键权限说明 → 宿主目标与偏好 → 可选人格 → 宿主确认 → 第一条可执行任务。授权不能隐藏在剧情按钮之中；用户能跳过动画、关闭主动提醒。

## 常驻工作区

建议提供系统终端、Host 状态、Quest Board（主线/支线/隐藏）、Growth/Skill Tree、Reward & Achievements、History/Audit、Permissions。DSH 的模型、插件和 MCP 管理仍可访问，不被系统皮肤遮蔽。

## 反馈设计

事件性提示分级：任务候选、证据待补、任务核验完成、技能评估变化、章节解锁。重要通知可用 `shell.overlay` 但不得打断操作；有低动效模式、静音与免打扰设置。

## 体验验收

首次使用者能判断任务来源、验收规则、奖励条件和撤销方式。故事文案和确定性事实的展示样式应有区分。任一角色扮演提示不得绕过权限和业务规则。



---

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

## P0 · DSH 原生插件可行性 Spike

交付：固定 DSH SHA、最小 Host/Client 插件、侧栏入口和完整面板、安装/启动/卸载指南、Web 与 Desktop 冷启动证据、插件管理和模型/会话功能回归。未完成前不宣称 Desktop 兼容。

## P1 · 最小可信成长闭环

交付：Host 绑定、Quest 接受、人工证据提交、确定性核验、XP 幂等结算、审计、SQLite 重启恢复。验收时至少完成一次真实可追溯任务；重复提交不得重复发奖。

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



---

# 08 · 风险、开放问题与维护规则

| 问题 | 当前状态 | 后续动作 |
|---|---|---|
| DSH Desktop 第三方 UI 插件 | 源码支持方向，尚未实测 | P0 冷启动/热重载/卸载 |
| 插件 Manifest 与 Host/Client RPC | 未固定版本验证 | 锁定 SHA 后实现最小样例 |
| 默认打开 Re:Origin 面板 | 未验证 | 实测布局和启动配置 |
| 多设备同步/冲突 | MVP 不支持 | 后续单独 ADR |
| 真实技能评估 | 不存在通用客观标尺 | 定义领域化证据、置信度与申诉 |
| 名称商标/域名 | 尚未正式核查 | 发布前检索与法律评审 |
| 主动观察现实 | 仅允许授权来源 | 授权、去重、静默、撤权测试 |
| 模型输出的可靠性 | 可能幻觉或被提示注入 | Schema 校验 + 独立裁决 |

## 结论状态的术语

- **已决定**：团队已采用的设计方向，不代表实现完成。
- **源码级确认**：已从第三方源码定位支持依据，不代表运行集成通过。
- **运行验证**：有确定版本、复现步骤、测试结果和日志/截图。
- **待验证**：风险仍开放，不能写成既成事实。

## 文档维护约定

重大技术决策新增 ADR，并注明背景、取舍、状态、复审条件与证据。领域实现变更需同步更新状态机、命令/事件契约和验收。优先维护分章节文档；发布里程碑时同步更新 `design-v0.2.md` 或生成新版整合稿。



---

## 架构决策记录

请参见 [ADR Index](./adr/README.md)，包含 DSH 原生插件、独立领域核心、证据驱动成长、本地优先存储和叙事/事实分离等决策。
