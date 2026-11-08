# 目标构建契约复核

编号：EVIDENCE-004。日期：2026-11-08（Asia/Shanghai）。范围：只读 Inspect、安装构建 README/实现与公开包正式声明；不是业务执行或真实集成验收。

## 基线与证据等级

直接读取的 Desktop 运行包版本标识及相关 DSH 包均为 0.2.2-rc.1，Cordis 为 4.1.0。版本标识不作为构建等价证明。实际运行契约以本次 Host/Client Inspect 及安装实现交叉检查为准；公开同版本 npm 包仅提供独立工程类型与离线测试，不能替代目标 Loader 验证。未读取其他本地项目，也未保存私人会话或设备标识。

## 直接观察

| 契约 | 观察与限制 |
|---|---|
| 主按钮 | Client Slots 完整目录及整体 composer 子树未声明独立主按钮扩展点。现有整体 composer 是 single、会遮蔽宿主 UI；右侧工具区是按钮前的 list，不是主按钮原位。当前不能靠正式细粒度入口完成严格原位验收。 |
| Client 服务 | 实际 Service 目录只公布部分服务；按猜测查询 uiConversation 失败。安装 README 描述标准 useInput/inputActions 与完整结构化草稿，不构成独立主按钮可替换承诺。 |
| 命令入口 | commands.register/execute 是正式接口；CommandInvocation 仅含 commandId、agent、rawInput、attachments、signal，没有 peer 或调用 Context。实现将冻结的 invocation 直接交给 handler，command/run 的 user 来源是执行器创建的归因，不是人类授权证明。 |
| Gateway 授权 | Gateway 在派生带 invocation 的服务 Context 前，按 endpoint、资源和已校验参数授权非 owner。commands/execute 的权限不蕴含 session/prompt。注册命令时捕获的 Context 和 Agent Context 不自动得到该次 Remote 的 invocation。 |
| 跨动作权限 | 真正 Remote 服务方法可读取调用 Context 的 invocation.peer；PeerScope 无 can/check 方法。remoteAccess.allows 只过滤当前 endpoint，缺少 invocation 时返回 true，不能用于命令 handler 跨动作检查。remoteAccess.decide 明确为 Gateway-only。未找到适用于本需求的正式无副作用 session/prompt 复核入口。 |
| 备选调用 | Gateway.invoke 可保留原 peer 调现有 session/prompt，静态推断会重新授权准确会话；该操作会真实发送，不是权限探测，且现有 prompt 构造 user/rpcId 来源，不能同时满足插件来源通知。本次没有调用。 |
| Agent 与收尾 | followup 为 next-turn 入队并唤醒；inject 为 next-step、不唤醒。实际 Agent 有 whenIdle，没有观察到 isQuiescent/whenQuiescent。status idle 也涵盖 maintenance；whenIdle 追踪稳定活动结束，不保证 inbox 空、某一输入完成或互斥提交。 |
| 消息与 inbox | createUserMessage 生成新稳定身份、role:user、深冻结的内容及来源，不授权、不发送、不持久化。inbox nextTurn/nextStep 为正式状态；变动同步记录 agent/inbox/spliced。claim 在异步准入之前，移出 inbox 不等于模型已收到。 |
| 待处理交互 | getPendingRemoteEvents 只提供未结算转发 Remote 事件的名称及 Agent 关联元数据，无正文和变更通知；不能证明所有业务交互已排空。 |
| 所有权与持久化 | SessionPersistence.open(write) 原子取得单写所有权，AgentLoop 创建/恢复先持有 writer；不得为既有 live Agent 再抢 writer 或替换 Session。whenIdle 不是 flush；命令回执也不是持久化证明。跨进程保证还取决于具体 persistence provider。 |
| 投影 | sessionProjections.register 必须 await，保存可释放句柄；apply 为纯同步折叠，wire.view 配合正式 Schema。投影不提供输入准入授权、全局比较交换或业务幂等。 |
| TypeScript | 安装 ASAR 中实际尝试读取的若干声明不存在，不能凭 manifest 的 types 字段声称 SDK 完整。公开 npm 包的同版声明可读取，作为开发依赖锁定；必须与目标运行反射核对，不推定二进制等价。 |

安装实现复核集中于 dsh-commands、dsh-api-gateway、dsh-api-remote-access、dsh-typert-protocol、dsh-api-session-controller、dsh-agent-loop、dsh-llm；独立只读核验结论与上述安全边界一致。

## 结论边界

当前正式主按钮入口与安全命令桥接均有实质缺口。不能在缺少受信调用者/模型执行权限时注册命令直接 followup，也不能用 source、Agent id、客户端 isTrusted 字段或插件自造令牌代替授权。后续产品路线须另行确认，不修改安装文件、DOM 或整个 composer，不添加旁置按钮，不降级成普通用户气泡续跑。可以继续独立工程、纯终止事实折叠和离线消息构建，但这些不代表可安装或可用插件。
