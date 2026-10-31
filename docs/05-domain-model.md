# 05 · 领域模型、状态机与数据契约

## 领域对象

| 对象 | 关键字段 | 不变量 |
|---|---|---|
| Host | id, profile, goals, preferences | 绑定可追踪，个人信息可撤回 |
| Quest | id, host_id, type, criteria_version, status | 状态转换必须合法 |
| QuestEvent | id, quest_id, type, at, actor | 只追加的审计历史 |
| Evidence | id, source, ref, observed_at, recorded_at, hash | 源可追、时间可核对、可去重 |
| Verification | evidence_id, verdict, rule_version, reason | 模型意见不等于最终裁决 |
| SkillAssessment | skill, tier, confidence, rule_version, basis, quest_ids, evidence_ids | 有来源、有边界、可复评；只追加 |
| Achievement | key, kind (badge/title), rule_version, cause_ref | 只由确定性规则解锁，每个 key 至多一次 |
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
ACCEPTED / IN_PROGRESS → PAUSED → IN_PROGRESS 或 CANCELLED（暂停期间期限不计时）
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

## 实现补充（2026-10-31）

- **期限**：`expires_at` 到期后 PROPOSED → CANCELLED，AVAILABLE/ACCEPTED/IN_PROGRESS → EXPIRED；SUBMITTED、VERIFYING、NEEDS_EVIDENCE 不受期限影响（宿主已行动，不能被时钟判失败）。
- **核验 `deterministic-v2`**：在 v1（类型与数量、观测时间不早于接受、内容哈希不跨任务复用、他人证据驳回）之上，证据必须「由授权来源佐证」或「宿主确认属实」之一才计入；佐证证据的 `observed_at` 取来源记录。
- **新增持久化表**：`consents`、`world_events`（`(consent_id, external_id)` 唯一，撤权可删除）、`notices`（`source_key` 唯一）、`memories`；`quests` 增加 `expires_at`、`skill`、`source_key`，`evidence` 增加 `corroborated_by`，`hosts` 增加 `preferences_json`。
- **新增命令**：`GrantConsent`、`RevokeConsent`、`UpdatePreferences`、`AddMemory`、`ForgetMemory`、`MarkNoticesRead`，仅宿主可发；`ingestCommits` 与 `tick` 是系统入口，不接受外部 actor。

## 技能评估与成就（2026-10-31）

- **技能评估 `assessment-v1`**（Growth Engine，`packages/domain/src/growth.ts`）：按成长标签读取经核验完成的任务及其被计入的证据，确定性计算。等级：起步（≥1 个任务）→ 实践（≥3 个任务、≥3 个不同日子、跨度 ≥7 天）→ 稳定（≥6 个任务、≥6 个不同日子、跨度 ≥30 天）→ 进阶（稳定 + 该标签下完成过突破任务）。置信度只看证据由授权来源佐证的比例：≥60% 且 ≥3 个任务为高，≥30% 为中，其余为低——宿主亲述再多也停在低。每条评估保存依据（任务数、活跃日、跨度、证据数、佐证数、突破数）及任务与证据 id。未打标签的任务不参与评估。
- **复评**：每次心跳（结算后立即触发）重新读取全部标签；与最近一条评估不同（等级、置信度、规则版本或依据变化）才追加新行，旧行保留。等级或置信度变化时生成系统消息。评估不读写 XP 账本。
- **成就与称号 `achievement-v1`**（`achievement.ts`）：徽章——初次觉醒、证据为本（首个证据全部经佐证的任务）、隐藏发现、破壁（突破任务）、七日之约（7 个不同日子完成日常任务）、十项实绩；称号——章节称号（立足者 / 破局者 / 传承者，随等级）、证据主义者（5 个全佐证任务）、`{标签}·实践者` / `{标签}·进阶者`（随技能评估）。每项记录触发它的任务或标签；`(host, key)` 唯一，只追加。
- **新增表**：`skill_assessments`、`achievements`（均由触发器保证只追加）；`hosts.title_key`。**新增命令** `EquipTitle`（仅宿主，只能佩戴已解锁的称号，`null` 卸下）。**新增事件** `skill.assessed.v1`、`achievement.unlocked.v1`、`host.title_equipped.v1`。
- Agent 只读到技能评估的等级、置信度、任务数与当前称号，人格中写明评估只反映系统内的记录，且它不能宣布或许诺评估、成就与称号的变化。

## 宿主主权（2026-10-31）

- **暂停**：`PauseQuest` / `ResumeQuest`（仅宿主）。`PAUSED` 不会被期限判为过期；恢复时期限按暂停时长顺延，状态回到 `IN_PROGRESS`。暂停中不能提交证据，可以放弃。`ResumeQuest` 只作用于 `PAUSED`（ACCEPTED → IN_PROGRESS 虽是合法边，但不是「恢复」）。`quests` 增加 `paused_at`。
- **导出**：Remote 方法 `exportData` 返回 `reorigin-export` v1 JSON，包含全部业务表与审计事件，`*_json` 列已解码。
- **删除**：`DeleteHost`（仅宿主，须重新输入宿主称呼）在一个事务中清空全部表，包括只追加的事件、账本、评估与成就，以及回放用的命令结果——审计记录同样是宿主的数据，删除后不保留删除记录。只追加触发器改为「`purge_guard` 表为空时拒绝删除」，清除过程临时写入一行守卫、结束前移除，其余时间约束不变。存储开启 `secure_delete`，Host 在删除后执行 WAL `TRUNCATE` 检查点，原始字节不留在数据库文件或日志中（测试直接扫描文件字节）。
- **审计视图**：`Dashboard.audit` 提供最近 40 条事件；面板按 causation 标注由宿主、Agent 还是系统引起。

## 奖励结算

建议奖励幂等键为 `host_id + quest_id + reward_rule_version + reward_type`。XP 和徽章受 Reward Engine 裁决；Growth Engine 才能维护真实技能的有证据评估。事件和账本与 Quest 状态写入必须具有可恢复的一致性协议。
