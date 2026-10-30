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
