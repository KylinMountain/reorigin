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

## 实现补充（2026-10-31）

- **期限**：`expires_at` 到期后 PROPOSED → CANCELLED，AVAILABLE/ACCEPTED/IN_PROGRESS → EXPIRED；SUBMITTED、VERIFYING、NEEDS_EVIDENCE 不受期限影响（宿主已行动，不能被时钟判失败）。
- **核验 `deterministic-v2`**：在 v1（类型与数量、观测时间不早于接受、内容哈希不跨任务复用、他人证据驳回）之上，证据必须「由授权来源佐证」或「宿主确认属实」之一才计入；佐证证据的 `observed_at` 取来源记录。
- **新增持久化表**：`consents`、`world_events`（`(consent_id, external_id)` 唯一，撤权可删除）、`notices`（`source_key` 唯一）、`memories`；`quests` 增加 `expires_at`、`skill`、`source_key`，`evidence` 增加 `corroborated_by`，`hosts` 增加 `preferences_json`。
- **新增命令**：`GrantConsent`、`RevokeConsent`、`UpdatePreferences`、`AddMemory`、`ForgetMemory`、`MarkNoticesRead`，仅宿主可发；`ingestCommits` 与 `tick` 是系统入口，不接受外部 actor。

## 奖励结算

建议奖励幂等键为 `host_id + quest_id + reward_rule_version + reward_type`。XP 和徽章受 Reward Engine 裁决；Growth Engine 才能维护真实技能的有证据评估。事件和账本与 Quest 状态写入必须具有可恢复的一致性协议。
