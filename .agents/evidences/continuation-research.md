# 续跑调研报告整理

编号：EVIDENCE-001。原报告日期：2026-11-07（Asia/Shanghai）。整理日期：2026-11-08。

## 来源身份与处理

来源为用户提供的《DSH 原位继续按钮与通知式续跑：调研报告与技术方案》，共 610 行；原始文件 SHA-256 为 d803e6db92be7f2c2eaaa7f224c009f23ceb343101d51885a62286592470592a。此记录是经过整理的证据摘要，不是逐字副本，仅保留与本插件有关的能力依据和限制。

报告区分运行安装版、固定上游和拟议插件。本轮阅读了报告，不将报告中的“本次 Inspect”“本会话测试”算作本轮再次完成的操作，也不将社区或旧源码描述当成当前最新保证。

## 报告观察与工程含义

| 报告章节/证据 | 报告所述观察 | 工程含义与限制 |
|---|---|---|
| 第 3、4 节 / E1–E4 | followup 唤醒新轮次，自定义来源输入可经 inbox 呈现为通知 | 仍是 user-role 模型输入，不是隐藏历史或恢复旧流 |
| 第 4、7 节 / E11 | commands 与 sessionProjections 有正式注册和生命周期接口 | 可用于 Host 桥接及资格投影，具体授权与竞争仍需验证 |
| 第 6、11 节 / E5 | 运行版有整体 composer 替换，没有核实到独立主按钮 Slot | 精确原位不是向右侧工具 Slot 加按钮；DOM 兼容非稳定 API |
| 第 5 节 / E6 | 固定上游对 RATE_LIMIT、SERVER、TIMEOUT、TRANSPORT、EMPTY_RESPONSE、STREAM_CLOSED 提供有限 retry | 不能推广至 UNKNOWN、手动取消、max-tokens 或任意安装构建 |
| 第 9、12 节 | 读取状态后入队有竞争窗口；旧请求和外部副作用可能尚未收尾 | 本插件锁不提供跨生产者原子性，未知结果不自动补投 |

## 可追溯公开索引

以下链接从原报告继承，本轮未联网刷新；可变分支及讨论只供历史线索，不用于承诺当前 API。

- 固定上游提交：fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159。
- 输入栏实现：https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx
- 继续资格：https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/api/session-controller/src/continuation.ts
- 输入栏说明：https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-conversation/README.md
- 原位按钮与 Slot 讨论：https://github.com/deepseek-ai/deepseek-harness/discussions/9269
- Composer Plus 与兼容限制：https://github.com/deepseek-ai/deepseek-harness/discussions/9277
- 细粒度 Slot 讨论：https://github.com/deepseek-ai/deepseek-harness/discussions/10398

## 未决事项保留

原位路线与实验性技术债接受程度、命令执行与模型权限的对应关系、来源准入到通知回执的实际闭环、跨生产者竞争保证、支持构建和会话格式仍待确认。报告推荐方案是“真实人类点击 + Host 校验 + 插件来源输入 + 原生通知回执”，不构成安装、发送或发布授权。
