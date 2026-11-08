# 首次安装与无模型请求集成核验

编号：EVIDENCE-008。日期：2026-11-09（Asia/Shanghai）。范围：经用户单独授权的当前 profile 安装、启用、禁用与只读运行核对；不包含真实续跑或模型请求。

## 授权与安装基线

用户明确允许安装/启用本工作区插件，检查 Loader、界面资源、原位显示及本插件禁用/卸载还原；不允许修改其它插件、审批/沙箱、发送实际模型请求或发布。需求授权主记录见 RFC-001。

开始本次核验时工作区干净；安装使用已提交并通过 EVIDENCE-007 的产品源码，授权确认后仅同步相关上下文。实际桌面运行 manifest 仍为 DSH 0.2.2-rc.1。经官方插件管理器列出既有 bundle 后安装本包；未手写 profile 或修改 DSH 安装文件。

安装器返回 enabled、changed 与 application: applied，顶层 warnings 为空，包管理步骤退出 0。底层包管理输出另有 linked dependency peer 解析提醒；此提醒不能直接认定运行失败，也不能当作已完成打包分发验证。

## 直接运行观察

- 官方管理器确认本插件精确 Loader entry 的 fiberPhase 为 active。
- 只读 Client Slot 查询确认 conversation.input.right 出现本插件 active registrant；这证明 Client 注册，不证明原位 DOM 或按钮可见性。
- 通过管理器仅禁用本插件，application: applied；再次查询原 Slot，本插件 occupant 已消失。重新启用后 application: applied，occupant 再次出现。未改动其它 entry。
- 通过正式 Config 目录解析已安装包后核对双语言资源，meta title/description 和业务文案存在；尚无 Plugin Manager 实际像素渲染结论。
- Host 服务目录不能查询到 manualContinue。继续读取实际 Inspect provider 后确认：该 Service provider 直接使用生成的静态 API catalog，不接收运行 Context，也不读取 live Typert；第三方新增服务不在此静态目录内。因此此错误不构成运行服务或反射注册失败的证明，未据此重启核心或重复安装。active entry 和 Client registrant 同样不足以证明完整受信 Remote 链，未伪造调用上下文或从模型上下文提交。
- 当前 profile 另有自动续跑插件处于 active；未擅自禁用、修改或读取其它本地工程。它可能影响后续模型闭环的归因，不能将其它插件行为算成本插件结果。

## 当前限制

现有工具没有直接浏览器控制或截图入口。没有启动替代服务器、另开浏览器、读取认证资料或用 mock 页面冒充当前 GUI。真实可见性、原位几何、原生 Tooltip、焦点/键盘/IME、实际 DOM 清理与展示元数据仍需用户协助或正式浏览器能力确认。未点击会触发续跑的控件、未发送模型请求、未消费 changeset、改版本、解除 private、推送或发布；不能据本次安装结果宣布生产开箱即用。
