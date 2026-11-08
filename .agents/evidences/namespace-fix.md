# 动态 Remote 命名空间缺陷与实测修复

编号：EVIDENCE-009。日期：2026-11-09（Asia/Shanghai）。范围：首次实际界面缺陷、只读匿名诊断、动态 Remote 关联服务修复与用户反馈；不扩大模型请求或发布授权。

## 缺陷与定位

用户提供已手动停止的实际会话画面：表面空输入区仍显示原生上箭头，没有续跑控件。仅确认 Host active 与 Client Slot 注册并不足以证明功能可用。

根据正式公开 Client Inspect registry 契约增加可选匿名只读快照，未新增业务 Remote 或模型执行工具。输出仅含当前 occurrence 序号、权限/候选/输入/会话门槛与自有 DOM 状态，不含会话标识、草稿正文、路径、账号、主机或原始异常。查询不 refresh、activate、重新 probe、修改 DOM 或发送 RPC。Provider 注册与各 occurrence reader 均随原生命周期释放。

实际快照显示连接和 generation 就绪、ACL 允许、完整草稿为空、DOM frame 匹配且无 inputDirty/changedRoot，但 owner 证明 unavailable，探测为 exception。快照首先应答的是正在运行的编码会话，不能把其无 candidate 当作用户停止会话的状态；全局 owner 探测异常则确实阻断任何续跑入口。

## 直接源码证据与修正

实际部署 Gateway 在 $mount 后提供独立的 remote.manualContinue 服务。Cordis Service tracker 的 associate 机制将生成调用中的 remote.manualContinue 读取转换为该关联服务的 Context 访问，要求注入它；ctx.get('remote') 同样是 traced 服务，不是绕过注入的原始对象。

原实现只有根 remote 注入，因而在生成 helper 读取命名空间时抛错，尚未到达 Host 权限判断或 JSON codec。实际生成 helper、部署 Gateway 与取消 ABI 一致，没有依据修改 codec 或放宽授权。

修复为先 $mount，再在其存活期建立 remote.manualContinue 的正式子注入，重新取得子 Context 的 traced Remote，交给只读 owner 查询和 submit/reconcile。authority、Slot 与子生命周期资源一起释放；没有将该自供命名空间放到顶层注入而造成启动互等。

公开 runner 完整 Client 声明会传递引入 Node-only loader 声明，不能放进生产 DOM 程序。生产边界使用正式 manifest/JsonValue 类型及 unknown 收窄 registry.register；单独 Node/DOM 测试将最小 provider 直接赋给完整公开 registration 类型核对兼容，没有伪造 SDK ambient 声明、关闭诊断或把 Node 全局加入生产 Client。

## 实测与限制

Client 重建后仅通过官方管理器禁用/启用本插件，新 Provider 在正式目录可见。修复后相同只读快照返回 business-available、ownerVerified=true、proofMatchesGeneration=true；证明实际只读 RPC 链已走通，未发送本插件续跑输入。

用户随后明确反馈：已经出现继续按钮，并且可以正常暂停和恢复。这是用户的实际使用反馈，不是 Agent 发送模型请求的授权，也不单独证明通知样式、持久化 provider、所有焦点/IME 场景或任意同版本构建均通过。

用户随后指出成功受理横幅并非需求且干扰心智；已删除成功/已受理分支的额外提示及双语言文案，不改原有历史或借此增加交互，并增加产物回归禁止该横幅文案重新进入。

最终统一质量入口通过三个严格环境类型程序、Biome、Host/Client 构建、官方生成链与全部 212 项测试。该计数是本项目直接运行结果，不能替代下述实际页面验收。

回归包含正式 registry provider 类型兼容/隐私/取消/释放，以及真实 Cordis Service tracker、关联服务和生成调用：父上下文只注入根 remote 时抛错且受控 carrier 零调用，子注入后保持 signal identity 且 JSON 不含 signal，顶层依赖自供命名空间会停在等待状态。测试只使用受控 carrier，不发实际 RPC 或模型请求。
