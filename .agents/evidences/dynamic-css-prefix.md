# 动态 CSS-module 前缀识别与构建差异验证

编号：EVIDENCE-010。日期：2026-11-09（Asia/Shanghai）。范围：工作区代码、实际构建观察、离线验证及随后明确授权的本地安装核验；不包含真实续跑或模型请求。开发与安装阶段的结果分别记录。

## 直接观察与根因

实际桌面运行 manifest 为 DSH 0.2.2-rc.1。只读部署 Client 产物的输入栏 module 映射，确认 primary、row、standardControls、trailing 使用 JZLxKW 前缀；已安装手动续跑 Client 则固定 GRgSLq。另一个同版本公开依赖产物使用 uV2eYG。这证明同版本构建的 CSS-module token 不同，尚不能仅将差异归因为 Windows/macOS。

终止元数据的只读核对及资格折叠重放表明：界面中的 terminated 为 error 的消息文本，code 为 UNKNOWN，不是独立 TurnEndReason。现有 error 规则正确产生候选，不需要新增 terminated 状态或修改 Host 授权。原始会话内容与身份不保存于本记录。

在相同有效展示条件下，原适配器的离线 DOM 对照：GRgSLq 匹配并显示自有按钮，JZLxKW 无法匹配 Frame 并保留 native。此实验不等于当前浏览器 DOM 或像素验收。

## 本次实现与审阅

需求与算法主记录分别为 RFC-001、SPEC-001；本记录只保存直接验证及限制。

- 原位适配不再包含已观察构建的固定哈希。classList 按完整语义后缀读取，不把动态前缀拼入 CSS selector。
- 发现限定为当前 Slot 的 composer card 祖先链；同前缀、各语义 token 与主按钮候选必须唯一。Frame 保存前缀并参与同步重新核对，不跨实例或跟随已失效结构。
- 自有按钮继续复制原生 className 以使用当前主题。原生发送/停止回调、资格规则、完整草稿/权限检查和 Remote 契约不变。
- 独立只读代码审阅未发现本次引入的阻断性安全问题。审阅提出的非法一致前缀、observer 前旧 mousedown 和 live 竞争按钮恢复用例已补充；审阅本身不是执行测试或集成验收。

## 验证范围与工具链限制

新增回归覆盖已观察及随机生成前缀、额外 utility class、同会话不同实例、混合/多 token、非法一致前缀、嵌套 controls、近似后缀、外来/无类名按钮、hidden/busy 竞争、其它 card 隔离、live 前缀变化与旧动作失效。保留既有独立 Stop、唯一 ownership、IME/完整草稿、原生替换、焦点/清理及 observer 不自循环测试。Client 产物回归禁止固定构建哈希重新进入。

最初使用 bundled Node 24.21.0 执行完整 check，在 tsdown 启动加载 Rolldown 的 darwin-arm64 原生扩展时失败。错误明确为 macOS library validation 的 Team ID 不一致；扩展文件存在，不能按顶层提示误判 optional dependency 缺失。只读检查其签名权限后，确认现有独立 Node 26.13.0 可以加载同一个 Rolldown 扩展；未重新安装依赖、删除锁文件、修改签名/系统安全设置或替换工具链。

后续使用现有独立 Node 26.13.0 执行相同锁定的完整 check，退出 0：Host/shared 与 Client 构建、官方非空 Remote 生成、Host/生产 Client/Client 测试三个 tsrs 严格程序、Biome（44 个自有文件）及全部 252 项测试通过。随后使用目标 bundled Node 24.21.0 直接复跑全部离线测试，252/252 通过。此记录区分构建用的独立 Node 与目标 Node 的执行结果，不声称 bundled Node 原生构建已成功。

对重建 Client 产物的内容核对确认 modulePrefix 与 cssPrefix 逻辑存在，未残留 GRgSLq、JZLxKW 或 uV2eYG 固定类名；这同时由产物测试断言保护。Semifold 成功创建 patch:fix 变更集，配置同步检查通过；仅查看发布计划，未实际更新版本。Git 差异与空白检查通过，未混入其它插件或依赖变更。

## 授权及剩余边界

开发阶段仅修改工作区源码、测试与相关文档，记录 Semifold patch:fix 意图，不进行安装。用户随后明确授权本地安装，实施结果如下；未消费 changeset、修改实际版本、公开发布或推送。

## 后续本地安装核验

- 将已验证的动态识别版打为独立的新本地压缩包，保留旧压缩包不覆盖。包名与版本仍为 dsh-client-manual-continue 0.0.0，DSH engine 限定不变。
- 打包列表为 33 个声明的代码、元数据与资源文件，不含依赖、测试、上下文、私人配置或缓存；安装前核对 Client/Host/适配器源码逐字节与工作区一致，Client 含动态识别且无固定哈希。
- 经正式插件管理器安装并启用，仅更新本插件；返回 changed=true、application=applied、packageResult.exitCode=0，顶层 warnings 为空。包管理日志含 peer dependency 提醒，没有安装失败、待批准构建脚本或重启要求；未据此放宽版本限定或修改其它依赖。
- 安装后逐个比较压缩包的全部 33 个文件与已安装文件，完全一致。已安装 Client SHA256 为 ffbbd02710eb4c17fbc11e4a407192cf2384711e255b632732bdf2b56faea334；目标适配逻辑存在，三套已观察固定哈希均不存在。profile 的来源由管理器指向新包，其余已记录依赖与 patch 内容未变化。
- 正式管理器再次确认精确 entry include:dsh-client-manual-continue 为 enabled、fiberPhase=active。中断后收尾又核对相同状态与全包一致性，不重复安装。
- 对原 GUI 地址的无凭据只读访问得到 401，证明服务应答但不能核对认证后的页面或当前已加载 Client 内存。因此不声称页面已刷新、按钮已显示或运行中自动更新；请用户刷新现有页面并在符合条件的会话确认。没有启动替代服务、读取认证资料、脚本点击或发起真实续跑。

## 实际页面辅助控件误计的最小修复

用户重启后仍未看到按钮；实际匿名 DOM 输出确认锚点存在、输入可编辑且 phase=plain，但同卡有两个 aria-busy 按钮，其中只有一个为直接 trailing 下的 primary。实际部署模型选择产物确认 trigger 同样有 aria-busy，并位于 standardControls 子树。这证明首版动态识别的候选扫描范围过宽；之前的小 DOM fixture 未包含该真实辅助控件，离线通过不足以证明页面兼容。

按用户要求最小修复，生产行为仅增加排除当前 controls 子树的条件，不新增权限、数据或状态门槛，不修改 Host、Remote、资格或 authority。默认 fixture 加入嵌套模型 trigger，补一个对应回归；原有其它回归保留。完整 check（构建、官方生成、三个严格类型程序、Biome、全部 253 项测试）退出 0，bundled Node 24 下复跑全部 253 项测试通过。新包与上一包的 Host/Remote 及 facts/authority 内容逐字节一致。

随后通过正式管理器安装修正版，返回 application=applied、changed=true、包管理退出 0；顶层 warnings 为空，底层仍有 peer 提醒。全部 33 个安装文件与修正版压缩包完全一致，Client SHA256 为 94b60ec7836dce7f7b0a1c7e6dfb32e5982f2365e64163b09e618ab033c2fa9d，profile 来源匹配新包，精确插件 entry 启用且 active。保留旧包，不修改其它插件，不触发模型请求。当前认证页面是否显示按钮仍等待用户刷新确认，未声称真实点击闭环已通过。

识别仍限定于已知语义后缀与完整布局，不承诺所有平台、未来布局、任意未知 wrapper 或 HMR 期间跨结构迁移。真实原位几何、键盘/无障碍、浏览器生命周期、Windows 运行和模型可见输入仍需各自实际验收；不把 mock 或产物文本检查当作实际使用结论。
