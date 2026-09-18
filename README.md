# dsh-lessons-md

[中文](README.md) | [English](README.en.md)

[错题本（Mistake Notebook）](https://github.com/FridayKoi/lessons-md) 的 **DeepSeek Harness (DSH) Web UI 可视化插件**：在 DSH 侧边栏里直接浏览、搜索当前工作区的 `LESSONS.md` 错题本，按等级（🔴 禁令 / 🟡 建议）分色显示、统计复发次数。

一个 AI 反复犯的错，值得一眼看清。

## 功能

- 📓 侧边栏面板：DSH Web UI 左侧栏新增错题本入口，点开即看
- 🔴🟡 按等级分色渲染条目（禁令红 / 建议黄），复发计数一目了然
- 🔍 实时搜索：按标题、场景、错误/正确做法、来源全文过滤
- 📊 顶部统计：条目总数、禁令/建议分布
- 📂 读当前会话所在工作区的 `LESSONS.md`，遵循 DSH 工作区模型
- 🤖 **Agent 工具**：注册三个模型可调用的工具，让 DSH 的 AI 自己维护错题本
- ⚡ **会话开场自动提醒**：自动向每个会话的系统提示注入"开工先读错题本"约定——装上插件即零配置生效，无需贴 AGENTS.md

### Agent 工具

| 工具 | 作用 |
|------|------|
| `notebook_read` | 读取当前工作区错题本全文（AI 开工前调用可以避开项目已知的坑） |
| `notebook_write` | 追加一条新错题（标题/场景/错误做法/正确做法/来源/等级） |
| `notebook_hit` | 给某条错题标记复发：计数 +1 并追加日期，**满 3 次自动升级为 🔴 禁令** |

三者配合形成闭环：AI 被纠正 → `notebook_write` 记录 → 下次开工 `notebook_read` 回避 → 再犯 `notebook_hit` 计数 → 累犯自动升级禁令。用户在侧边栏面板里随时看到全貌。

## 与 AGENTS.md 接线（推荐组合）

DSH 原生读取项目根目录的 `AGENTS.md`。**本插件已内置会话开场提醒**（通过 DSH 系统提示机制自动注入，装上即生效），AGENTS.md 接线是可选的增强——两者互补：

- `AGENTS.md` 负责"让 AI 每次会话自动读错题本"（习惯层）
- 本插件负责"可视化 + AI 工具 + 面板管理"（工具层）

把下面的接线块贴进项目根目录的 `AGENTS.md` 即可：

```markdown
## Mistake Notebook（错题本）
- 开始任何任务前，先看项目根目录是否存在 LESSONS.md：存在则通读全部条目，并回复一行"已读错题本（N 条）"作为确认（没有这行确认就视为没读）；不存在则跳过本节
- 准备执行的操作与某条目的"触发场景"匹配时，先重读该条目再动手；🔴 禁令条目无例外，违反前必须停下说明
- 会话结束或完成一个阶段性任务后，主动询问用户是否运行 /retro 复盘
- 踩坑提炼一律写入项目根目录的 LESSONS.md（按其条目格式，含复发日期）；不要写入自动记忆等其他文件
```

> 完整的跨工具安装指南（三档模式：被动 / 半自动 / 全自动）见上游仓库 [FridayKoi/lessons-md](https://github.com/FridayKoi/lessons-md) 的 `docs/INSTALL.md`。

## 条目格式约定

本插件解析并显示 `LESSONS.md` 的以下字段：

- **标题**：`## [E-XXX] 祈使句`（一行说清"该怎么做"）
- **触发场景**：什么情况下应想起这条
- **❌ 错误做法** / **✅ 正确做法**
- **复发**: `N 次（MM-DD, ...）`——复发计数与日期留痕
- **等级**：🟡 建议 / 🔴 禁令
- **来源**：来自哪次任务/哪个工具

两个进阶字段（面板同样解析显示）：

- `- 同族: E-XXX`：同根因、不同修法的关联条目；命中一条时应把整族都读一遍
- `- 升级: YYYY-MM-DD 第3次复发，升级为禁令`：自动升级的留痕记录

**人工编辑优先**：面板上的删除/编辑操作就是人工编辑，被 AI 记录规则尊重——AI 不会把人工删掉的条目原样重建（若再犯确需重建，须注明"曾于某日人工删除"，该约定由上游 lessons-md 仓库的 skill 负责）。

## 安装（规划中）

插件尚未发布到 npm，当前为本地开发状态。发布后将支持：

```bash
dsh plugin --profile web add dsh-lessons-md
```

## 本地开发

前置：Node.js ≥ 24；本机用 `npx @deepseek-ai/dsh web` 跑过一次 DSH（生成 `~/.dsh`）。

```powershell
# 1. 把本包装进 web profile（模拟 dsh plugin add）
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-lessons-md" -Target "<本仓库路径>"
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

- **只读解析**：按 lessons-md 条目格式解析 `## [E-XXX] 标题` 与 触发场景/❌/✅/复发/等级/来源 字段，解析失败时回退提示
- **面板编辑**：通过 DSH 的 commands 机制（`/lessons-add` `/lessons-edit` `/lessons-remove`）由 Host 端直接写盘，不经模型
- **无需自有 RPC**：静态插件不能新增 Remote 命名空间，v1 复用 DSH 内置的 `workspaceFiles.read`，因此天然零密钥、零模型调用
- 已知兼容性：基于 DSH 0.1.5-rc.1 开发，插槽 API 属快速迭代期，升级 DSH 后需回归验证

## Roadmap

- [x] v0.1：只读面板（分级渲染 / 搜索 / 统计）
- [x] v0.2：Agent 工具（notebook_read / notebook_write / notebook_hit，含自动升级）
- [x] v0.3：面板编辑（/lessons-add /lessons-edit /lessons-remove，Host 端直写）
- [ ] npm 发布 + 截图 + 英文 README（其中 **npm 发布仍未完成**）

## License

MIT
