# 工作区初始化与核验

编号：EVIDENCE-002。日期：2026-11-08（Asia/Shanghai）。范围：工程上下文初始化，不实施插件。

## 本轮直接检查

- 起始目录为空，git status 报告不是 Git 仓库；这是未初始化状态，不是已有仓库损坏。随后 git init 成功，初始分支为 main，无既有提交或用户改动。
- 阅读完整调研报告并记录原文件 SHA-256，形成 EVIDENCE-001 的可移植摘要，仅保留与本插件有关的能力依据和限制。
- 工程上下文采用分层、唯一编号、单一事实来源和约定式提交规范；技术约定限定为本插件的 TypeScript、构建、类型检查及界面质量要求。
- TypeScript 工具约定为 tsdown/Rolldown/Oxc、tsrs、严格类型检查和 Biome；格式为单引号及 JSX 单引号、2 空格、100 列、按需分号。这是工程规范，不宣称工具版本是当前最新或相应检查已经执行。
- 读取实际安装包 @deepseek-ai/dsh-agent 的 README 中 Drive an agent's conversation：followup 入队并唤醒，inject 不唤醒，whenIdle 等待整个 Agent 静止。
- 读取实际安装包 @deepseek-ai/dsh-llm 的 createMessage/createUserMessage 实现：创建新稳定身份、克隆并冻结，角色为 user。读取行为不等于发送输入或验证可用性。

## 补充只读核验

同轮独立核验读取实际安装包的 README、JS 与包元数据（版本标识 0.2.2-rc.1），不是重新运行原报告的 Inspect 或功能测试：

- @deepseek-ai/dsh-goal-round-driver 的创建消息与 followup 调用、活动 Agent/竞争状态复核提供已有 JS 先例，不可复用 goal 来源冒充目标驱动。
- @deepseek-ai/dsh-session-format-v3-to-v4 的 assertV4MessageSources 接受合法未知归因，拒绝旧 kind: plugin 包装；这不构成授权验证。
- @deepseek-ai/dsh-client-ui-chat 的非 user 来源分类仍取决于 inbox claim，turn-trigger 通知可以展开；不是任意自定义来源必然产生通知。
- @deepseek-ai/dsh-commands 的 register 返回释放函数，execute 建立含 agent、commandId、rawInput、attachments、signal 的调用上下文并调用处理器，记录 command/run 与 command/done。appendLifecycle 使用 log-only append，不强制 flush；命令返回或成功行不等于续跑输入已持久化或模型已开始。取消等待不保证忽略 signal 的处理器已停止副作用；未核实 Gateway/Remote 的模型权限映射。
- @deepseek-ai/dsh-session-projection 的 sessionProjections.register 需要等待，apply 为同步折叠，wire.view 提供视图；句柄可释放，快照包含 asOfSeq/values。这些接口不自动提供业务幂等或跨崩溃 exactly-once。
- 未取得可读取的安装类型声明，未完成类型声明核对与 Client 实际调用验证；Host execute 参数及 invocation 字段已由本轮 JS 核实。同名版本不能证明与固定上游提交一致，实施时仍需核对目标构建。

## 结论与取舍

通知式续跑的项目职责是 TypeScript Host/Client 适配与纯状态逻辑，复用宿主已有执行能力。没有为将来代码预建空模块、安装依赖、锁定工具版本或引入形式上可运行但无代码可检查的脚本；TypeScript 质量基线先由全局规则和 SPEC-001 约束。

## 验证边界

本轮文档检查通过：9 份 Markdown、7 个唯一编号，编号引用全部可解析且导航完整；未检出本地路径及所检查的本地工程/身份标识。独立只读复核未发现阻断性语义问题，补充了命令回执与持久化的区别。11 个上下文与 Git 基础文件的暂存差异已完整审阅，git diff --cached --check 通过；Git 属性确认文本行尾为 LF。检查结论仅针对本次文档及基础配置，不代替后续实现验证。

本轮没有执行插件类型检查、Biome、构建、模型输入、安装、Client Inspect、GUI 点击或浏览器验收；工作区没有插件源代码或相应工具配置。没有修改当前 DSH 安装、启动替代服务器、发起 PR、推送或发布。
