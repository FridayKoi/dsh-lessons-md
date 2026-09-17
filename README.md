# dsh-mistake-notebook

[错题本（Mistake Notebook）](https://github.com/) 的 **DeepSeek Harness (DSH) Web UI 可视化插件**：在 DSH 侧边栏里直接浏览、搜索当前工作区的 `LESSONS.md` 错题本，按等级（🔴 禁令 / 🟡 建议）分色显示、统计复发次数。

一个 AI 反复犯的错，值得一眼看清。

## 功能

- 📓 侧边栏面板：DSH Web UI 左侧栏新增错题本入口，点开即看
- 🔴🟡 按等级分色渲染条目（禁令红 / 建议黄），复发计数一目了然
- 🔍 实时搜索：按标题、场景、错误/正确做法、来源全文过滤
- 📊 顶部统计：条目总数、禁令/建议分布
- 📂 读当前会话所在工作区的 `LESSONS.md`，遵循 DSH 工作区模型

## 安装（规划中）

插件尚未发布到 npm，当前为本地开发状态。发布后将支持：

```bash
dsh plugin --profile web add dsh-mistake-notebook
```

## 本地开发

前置：Node.js ≥ 24；本机用 `npx @deepseek-ai/dsh web` 跑过一次 DSH（生成 `~/.dsh`）。

```powershell
# 1. 把本包装进 web profile（模拟 dsh plugin add）
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-mistake-notebook" -Target "<本仓库路径>"
# 2. 同时链接官方运行时包（供插件引用，免重复下载）
New-Item -ItemType Junction -Path "<本仓库路径>\node_modules\@deepseek-ai" -Target "$env:USERPROFILE\.dsh\profiles\node_modules\@deepseek-ai"
# 3. 挂载并启动
dsh web --patch <本仓库路径>/cordis.yml --port 3082
```

打开终端输出的地址，侧边栏点击 📓 图标即可。开发期改 `src/client.js` 后刷新浏览器即可生效（服务端按内容 hash 出新版本，无需重启）。

> 无需 API Key：面板是纯浏览器端实现，通过 DSH 的 `workspaceFiles` Remote 直接读工作区文件，不调用模型。

## 工作原理

```
src/host.js    Host 入口（壳）：让 DSH Loader 发现并挂载本包
src/client.js  Client 入口：手写的惰性 CJS bundle（ModuleLoader 契约）
               ├─ slots.inject('sidebar.panellist') → 侧边栏图标
               ├─ slots.inject('main')              → 全局面板正文
               └─ ctx.remote.workspaceFiles.readAll → 读 LESSONS.md
```

- **只读解析**：按 mistake-notebook 条目格式解析 `## [E-XXX] 标题` 与 触发场景/❌/✅/复发/等级/来源 字段，解析失败时回退提示
- **无需自有 RPC**：静态插件不能新增 Remote 命名空间，v1 复用 DSH 内置的 `workspaceFiles.read`，因此天然零密钥、零模型调用
- 已知兼容性：基于 DSH 0.1.5-rc.1 开发，插槽 API 属快速迭代期，升级 DSH 后需回归验证

## Roadmap

- [ ] v0.2：界面上编辑条目、手动升降级（Host 侧加文件写入）
- [ ] v0.3：注册 Agent 工具，让 DSH 的 AI 会话内直接读写错题本（与 `/retro` 工作流打通）
- [ ] npm 发布 + 截图 + 英文 README

## License

MIT
