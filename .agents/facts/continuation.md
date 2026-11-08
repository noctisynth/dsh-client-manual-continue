# DSH 续跑机制与工程事实

编号：FACT-001。更新：2026-11-08。依据：EVIDENCE-001、EVIDENCE-002、EVIDENCE-004。

| 事实或判断 | 证据等级 | 适用限制 |
|---|---|---|
| followup 将普通后续输入入队并唤醒驱动，inject 不唤醒；whenIdle 等待整个 Agent 静止 | 本轮直接读取安装包 README | 仅针对实际读取的安装包契约，未执行续跑 |
| createUserMessage 创建带稳定身份的不可变 role: user 消息 | 本轮直接读取安装包 JS | 不代表自定义来源已通过完整准入与通知验收 |
| 非 user 来源输入可按 inbox claim 分类为 turn-trigger 通知，正文可展开 | 原报告观察；本轮补充只读复核安装包 JS | 本轮未重新查询运行时或实测 Chat；任意来源不保证成为通知 |
| Host 命令与会话投影可组成操作桥接和资格视图 | 原报告观察；本轮补充核对见 EVIDENCE-002 | 实现时仍需核实签名、权限与真实组合 |
| 当前目标未声明独立主按钮 Slot，整体 composer 与主按钮前工具区已存在 | 本次 Client Inspect 完整目录及 composer 子树直接观察 | 仅针对实查构建，不自行选择整体替换或 DOM 路线；见 EVIDENCE-004 |
| 当前命令 handler 不携带调用 peer，命令执行权限不蕴含模型执行权限 | Host Inspect 与安装 Gateway/命令实现直接复核 | 不能直接 commands → followup；尚无符合本需求的正式无副作用跨动作权限检查入口；见 EVIDENCE-004 |
| 当前未观察到独立 quiescence 提交锁；idle/whenIdle 不提供排空 inbox 与跨生产者原子准入 | 安装 AgentLoop 实现直接观察 | 不承诺旧活动/维护排空或全局 exactly-once；见 EVIDENCE-004 |
| 固定上游基线对部分错误有 retry 来源的空输入继续 | 原报告对固定提交的观察 | 不能套用于当前安装版、UNKNOWN 或手动取消 |
| 本轮工作区起始为空，尚无 Git 仓库或插件实现 | 本轮直接检查 | 此后初始化内容的任务状态仅由 TODO-001 维护 |
| 通知式新轮次续跑可由 TypeScript Host/Client 适配组合现有宿主能力 | 基于上述契约的架构判断 | 不是端到端兼容或可用性保证，不涵盖零输入轮次恢复 |

观察事实、报告转述与架构判断不得混用。宿主接口或产品语义改变时，先补充对应证据，再更新本表与受影响方案。
