# Semifold 配置与模拟验证

编号：EVIDENCE-003。日期：2026-11-08（Asia/Shanghai）。范围：版本与发布管理配置，非产品发布。

## 已核实依据

本轮核对 Semifold 官方配置参考、包发现和首次发布说明，并读取实际 CLI 的帮助输出。实际可用 CLI 为 smif 0.3.5；此版本号是验证基线，不是永久最新版本保证。

- 配置参考：https://semifold.noctisynth.org/docs/configuration/reference/
- 包发现规则：https://semifold.noctisynth.org/docs/workspace/package-discovery/
- 发布生命周期：https://semifold.noctisynth.org/docs/getting-started/first-release/

上述来源用于确认单包发现、版本意图、计划、版本变更及发布职责；不将工具实现细节引入项目上下文。配置由 smif init 的 Node.js 选项生成，未生成 GitHub Actions 工作流。

## 配置结果

- 单包 PackageId 和包名为 dsh-client-manual-continue，初始版本为 0.0.0。
- 基础分支 main 与发布准备分支 release 分离，保留生成的 changelog 和 changeset 模板及五类标签。
- Node.js resolver 配置 npm 注册表版本预检查，以及带 provenance 和 public access 的 npm 发布命令。
- 包暂设 private，当前未选择公开分发许可，不引入运行时依赖或空插件实现。首次公开发布前须满足 SPEC-001 的产物和授权条件。
- 工程提供 changeset、release:check、release:status、release:version、release:publish 五个脚本入口，调用同一 smif CLI；没有引入第二套版本管理工具。

## 实际验证结果

| 检查 | 结果与限制 |
|---|---|
| smif config sync --check 及 release:check 脚本 | 通过，配置与发现的包同步 |
| smif status 及 release:status 脚本 | 通过，0 个 changeset、0 个待升级包；不以此计数判定包是否被发现，包发现由同步检查及下述模拟确认 |
| changeset 脚本携带 --dry-run、包名、patch 级别和 chore 标签 | 通过，目标包及标签可解析，未创建文件 |
| release:version 脚本携带 --dry-run --allow-dirty | 通过，报告无待处理 changeset；未实际升级版本或生成变更日志 |
| release:publish 脚本携带 --dry-run --allow-dirty | 通过，识别 1 个包并因缺少 changelog 跳过，成功发布数为 0；不能将此结果称为已验证真实 npm 发布或 private 拒绝路径 |
| 模拟前后文件对比 | 包元数据与 Semifold 配置未变，未新增或消费 changeset |

验证中 allow-dirty 只用于检查尚未提交的本轮配置，不代表允许带未审阅差异进行实际版本更新或发布。本次不为尚未实现的产品虚构发布意图，也未创建令牌、推送分支、调用实际版本更新或发布资源。
