# 工程与离线逻辑验证

编号：EVIDENCE-005。日期：2026-11-08（Asia/Shanghai）。范围：独立核心里程碑的工程与离线逻辑；后续 Host 验证见 EVIDENCE-006，不是插件安装或真实续跑验收。

## 工具与依赖基线

实际使用 Node.js 24.21.0、pnpm 11.28.5、tsdown 0.23.7（实际 Rolldown 1.3.0）、tsrs 0.23.0-ts7.1.0-beta、Biome 2.6.6、Semifold 0.3.5。开发依赖按精确版本记录并由 pnpm 锁文件固定传递解析；DSH 类型与测试运行库为公开包 0.2.2-rc.1，Cordis 为 4.1.0。公开包与运行安装包的等价范围见 EVIDENCE-004。

核实依据：官方 npm registry 元数据、实际 CLI 版本、正式类型声明和构建输出。tsrs 是 Rust TypeScript 检查器的实验版本，本次没有使用 tsc 替代检查，也没有设置 skipLibCheck、noCheck、全局诊断屏蔽或类型逃逸。

公开来源：

- https://github.com/oxc-project/tsrs
- https://tsdown.dev/options/output-format
- https://registry.npmjs.org/tsdown/0.23.7
- https://registry.npmjs.org/tsrs/0.23.0-ts7.1.0-beta
- https://registry.npmjs.org/@biomejs/biome/2.6.6

## 实际兼容问题与处理

| 问题 | 观察及处理 |
|---|---|
| 默认缓存越界 | npm 元数据查询尝试写入工作区外缓存，被沙箱拒绝；没有扩大权限或重试绕过。后续查询使用只读 registry fetch，项目安装显式配置工作区内缓存。 |
| pnpm 设置与链接 | 当前 pnpm 未采用最初的旧格式配置，默认 store 初始化失败；改为正式工作区 YAML。isolated 布局在工作区依赖符号链接阶段出现 EISDIR；检查具体对象后改用 pnpm 正式 hoisted 布局，相同依赖版本安装成功。未换包管理器、工具链或改全局设置。 |
| 声明依赖 | 首次严格检查发现 DSH LLM 声明依赖 attachment/package-manifest，及协议需要 Disposable 标准库；补齐精确版本的声明依赖和 ESNext.Disposable。未关闭第三方声明检查。 |
| 脚本工具解析 | 加入精确 packageManager 后，聚合检查中嵌套调用 pnpm 命中了另一全局 shim，尝试取得工作区外引擎 store 锁被拒绝。聚合入口改为直接调用项目内已锁定的检查二进制，避免递归解析包管理器；不取消工具锁定、不改全局缓存、不放宽权限。 |
| 测试派生 | Node 默认隔离测试尝试捕获子进程 stdio，触发沙箱 spawn EPERM；改用 Node 官方同进程 test-isolation=none，不扩大权限，不换测试框架。 |
| Biome 规则 | 当前版本将 recommended 布尔项标记弃用；按随包 Schema 改为 preset: recommended，保留推荐规则、单引号、JSX 单引号、2 空格、100 列和按需分号。 |

## 已观察验证结果

- Host 和 Client 两份 tsrs 严格类型检查通过；Node 与 DOM 环境分开，Client 当前只检查共享逻辑，不代表已实现 Client UI。
- Biome check 通过，检查实际自有 TypeScript、测试与工程配置；生成物和依赖不纳入治理。
- 冻结锁文件的离线安装复核通过，未更改解析；实际 peer 检查无缺项，四个构建 ESM 模块离线导入与关键导出冒烟通过。
- 完整暂存差异经独立只读审阅；发现的资格折叠事件缺口风险已改为连续序列校验并补回归测试，不因跳过竞争输入保留陈旧候选。
- Node 原生离线测试 79 项通过，覆盖所有 error、用户停止与截断/中断候选，正常完成及非用户取消不提供候选，新轮次/竞争 inbox/用户消息使旧候选失效，错误和历史不被修改，来源消息身份及不可变性，JSON 请求语义边界，连续事件对账、身份冲突、claim/cancel 不冒充模型开始，以及未知结果不自动补投。
- tsdown 构建通过，输出资格、请求协议、日志对账和离线消息构造的实际 ESM 入口；宿主运行库保留外部依赖，不打包复制宿主执行能力。
- Semifold 配置同步检查通过；通过 smif commit 创建资格工程的 minor 意图与对账逻辑的 patch 意图。status 仅展示计划，未运行实际 version 或 publish，未消费 changeset，版本仍为 0.0.0、private 仍为 true。

## 不可扩大解释的边界

本次测试创建的是离线 Session 和冻结消息值，没有创建实际 Agent、模型调用或活动会话请求。消息构造不是幂等、输入接受或持久化：同 requestId 再构造会生成不同 MessageId，必须由后续受信 Host 操作负责去重，并使用已实现的增量对账逻辑核对来源与稳定消息身份，不能据此盲目补投。

已锁定并读取官方 dsh-typert-generator 0.2.2-rc.1，生成器依赖 TypeScript 6.0.3 用于静态模型提取，不替代 tsrs 项目类型检查。实查其 workspace 注册仅接受约定包树中的项目引用；当前单包直接 discover 返回空列表，后续正式 Remote 构建必须适配这一真实限制，不能将零产物当成功。尚未生成或验收本插件的 strict Remote codec。

尚未实现可接受续跑的 Host 操作、正式 Client 原位适配与完整投影注册。真实调用者授权、双击/多标签准入、跨异步等待复核、未知结果对账、取消/卸载释放、原生通知持久化与模型可见输入闭环未验收，不以这些离线测试替代。没有安装插件、修改当前 DSH、操作运行 GUI、发送续跑输入、推送或发布。
