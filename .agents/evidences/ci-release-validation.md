# 质量与自动发布配置验证

编号：EVIDENCE-011。日期：2026-11-10（Asia/Shanghai）。范围：质量与发布配置、独立打包校验回归、Semifold 模拟，以及明确授权的仓库可见性修改；不包含安装依赖、完整工程检查、远程工作流运行或真实发布。

## 用户结论与授权

用户明确确认产品验收完成，并要求配置质量检查和 Semifold CI/CD，本地版本保持 0.0.0、下一版本为 0.1.0；随后选择 MIT 公开 npm 发布，但本轮不安装依赖。用户进一步明确要求 --provenance 并将本 GitHub 仓库改为 public。验收结论属于用户确认，不补写 Agent 未直接执行的逐项操作证据。

## 直接观察与配置

起始 Git 基线为 d5331b2，main 与本地 origin/main 一致且工作区干净。远端平台为 GitHub。初始包为 private、UNLICENSED、0.0.0；已有七个 changeset，现有 minor 计划已指向 0.1.0，无需手工提版本。

- 移除 private，采用 MIT，增加匹配实际仓库的 repository 和 public npm 元数据，保留第三方 notices；产品 Host/Client 行为不变。
- Quality and Release 工作流区分只读质量作业与 main 专属发布作业，后者依赖前者通过，串行且不取消在途发布。工具与 Action 提交固定；具体数值以实际配置为主要记录，操作说明见 GUIDE-001。
- 新增实际 npm pack dry-run 清单校验及独立测试，更新原有分发元数据测试的 private/MIT 断言。校验要求已存在的真实构建产物，不用空占位物通过 CI。
- 使用正式 smif commit 追加 patch:chore 版本意图，保留全部历史 changeset；未运行真实 version、publish 或 ci。
- 公开前对当前工作区及全部本地 Git 引用做定向敏感模式检查：九个提交、145 个历史 blob 未命中所查的高置信令牌、私钥、敏感文件名或个人本机路径模式。没有可用的专业秘密扫描器，此结果不是不存在任何敏感数据的全面保证。
- 按新增明确授权修改本仓库可见性，gh repo view 随后返回 PUBLIC。未修改其它仓库设置、创建 secret、推送本地变更或触发工作流。
- Semifold 的 npm 命令保留 --provenance；只给发布作业 id-token 写权限，npm 认证使用 NPM_TOKEN。配置了 provenance 的条件，不把它写成已经完成的真实签发证明或 npm trusted publisher 绑定。

## 实际验证

| 检查 | 结果与限制 |
|---|---|
| 独立打包校验回归 | Node.js 22.20.0 使用内置类型剥离运行六项，全部通过；目标 bundled Node.js 24.21.0 再运行同六项，全部通过。使用合成文件清单，不等于完整分发包或插件集成验证 |
| 新增 TypeScript 语法 | Node 内置语法检查通过，不等于 tsrs 严格类型检查 |
| 工作流与 composite YAML | 系统 Ruby YAML 解析通过，并定向断言事件、main 门槛、质量依赖、权限、并发及 Action 提交固定；不是 actionlint 或 GitHub 实际运行 |
| JSON 与 TOML | 包元数据及 Semifold 配置解析、0.0.0/MIT/public/repository/provenance 条件核对通过 |
| smif config sync --check | 本机 smif 0.3.4 通过；CI 固定 0.3.5 的官方契约已核对，但本轮未安装或本地执行该版本 |
| smif status | 八个 changeset、一个包，目标 0.0.0 → 0.1.0，minor，计划指纹 e2793f9bfb31 |
| smif version --dry-run --allow-dirty | 通过，目标 0.1.0、发布分支 release；未更新版本、写 changelog 或消费 changeset。allow-dirty 只用于本轮未提交配置的模拟，不用于真实 CI 发布 |
| Git diff 与空白检查 | 检查本轮差异，git diff --check 通过；本地版本仍为 0.0.0 |

本轮未安装依赖，因此未执行完整 tsrs、Biome、原有全部测试、Host/Client 构建及真实打包完整性校验；不能把此前 253 项通过数移作本轮结果。没有 actionlint 可用，也未安装替代工具。首次真实质量与发布运行仍以 TODO-001 的远端执行待办为准。

## 官方依据与边界

- Semifold 0.3.5 官方工作流模板：https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/crates/semifold/assets/semifold-ci.yaml.jinja
- Semifold CI 契约：https://semifold.noctisynth.org/docs/commands/ci/
- Semifold 配置与发布状态规则：https://semifold.noctisynth.org/docs/configuration/reference/
- npm provenance 条件：https://docs.npmjs.com/generating-provenance-statements/
- GitHub 的令牌触发和批准行为：https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow

仓库公开与工作流文件存在不表示自动化已启用或 npm 已发布。仍需维护者审阅并合入本地配置、准备 npm secret/发布权限，批准发布 PR 的检查并合并，随后核对 registry 与 GitHub Release。主分支保护及 npm 凭据未由本轮配置或验证。

## 2026-11-11 首次 CI 失败与入口修复

配置已于此前获授权提交并推送，基线为 7350d87。直接读取首次 Actions 运行记录及失败日志：工具和依赖安装成功，Check Semifold configuration 报 sh: 1: smif: not found；后续构建、类型、Biome、测试、打包及发布作业均被跳过，没有发布 PR 或 GitHub Release。运行记录：https://github.com/noctisynth/dsh-client-manual-continue/actions/runs/42865095139 。

根因由官方 0.3.5 安装脚本确认：预构建安装只写入 semifold 可执行文件，官方 CI 模板同样调用 semifold ci；Cargo 安装则可提供 semifold 与 smif 两个入口。本地使用 Cargo 的 0.3.4 且两入口均存在，因此此前本地模拟未能发现 CI 安装方式的差异。参考：https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/docs/public/install/install.sh 。

用户明确授权修复并推送。最小修复统一六个项目脚本为 semifold，并在安装后、项目依赖安装前执行 semifold --version；不升级工具、不添加软链接或回退、不改 provenance、凭据或插件运行逻辑。增加两项入口回归。

本地直接验证：目标 Node.js 24.21.0 的新增两项与既有打包校验六项合计八项通过；composite YAML 解析及安装顺序断言、配置同步、差异空白检查通过。semifold commit 创建 patch:fix 版本意图后，现有九个 changeset 仍规划 0.0.0 → 0.1.0，版本 dry-run 通过且没有消费 changeset。本机 CLI 仍为 0.3.4；未安装本地依赖，未据此声称完整工程检查或修复后的远程 CI 已通过。

入口修复以 5cebafa 推送后，新一轮 CI 的 Setup tools 和 Check Semifold configuration 均通过，原入口错误已由真实 CI 复核消除；完整工程步骤随后在新增打包测试的严格类型检查上失败。GitHub 检查注释明确指出目录读取结果为 string | NonSharedBuffer，不能直接调用 endsWith 与 replaceAll。最小后续修正是在测试目录读取时显式指定 UTF-8 编码，选择字符串返回值的正式重载，不使用断言或放宽类型检查，不改变插件行为。运行记录：https://github.com/noctisynth/dsh-client-manual-continue/actions/runs/42977634300 。

类型修正以 0af7aad 推送后，下一轮实际日志确认 Host/Client 构建、正式 Remote 生成和三个严格类型程序全部通过，随后 Biome 在三个新增工程文件中报告四处格式或导入排序错误。按日志给出的准确格式仅调整参数换行、JSON 读取换行及导入顺序，不禁用规则；此时测试与发布步骤仍未执行。运行记录：https://github.com/noctisynth/dsh-client-manual-continue/actions/runs/42978411607 。

格式修正 a28af44 的真实 CI 全部成功：Quality 的配置同步、构建、三个严格类型程序、Biome、全部离线测试、真实打包清单检查及版本预览通过；Semifold Version or Publish 的重新构建、包核对和 semifold ci 也通过。Semifold 自动创建 release → main 的发布 PR #1；直接读取 release 分支包元数据确认目标为 0.1.0，main 与本地仍保持 0.0.0。没有合并 PR、消费本地 changeset 或执行 npm 发布；PR 检查尚无记录，不能把主分支 CI 成功等同为发布 PR 已完成检查。运行记录：https://github.com/noctisynth/dsh-client-manual-continue/actions/runs/42979338424 。发布 PR：https://github.com/noctisynth/dsh-client-manual-continue/pull/1 。
