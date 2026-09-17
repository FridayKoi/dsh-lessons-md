# 项目错题本 / Mistake Notebook

> 本文件由 `/retro`（mistake-retro skill）维护，人工也可以直接编辑——人类编辑优先。
>
> **AI 必读**：开始任何任务前，先通读本文件全部条目；准备执行的操作与某条目的"触发场景"匹配时，必须先重读该条目并按"✅ 正确做法"执行。🔴 禁令条目为硬性约束，无例外。

## 统计

- 条目数：2
- 最近更新：2026-09-17

## 条目

## [E-001] client 端访问 remote 命名空间必须在 inject 里按点名声明
- 触发场景: 面板/组件代码里调用 `ctx.remote.<命名空间>.<方法>`（如 `ctx.remote.workspaceFiles.readAll`）
- ❌ 错误做法: client 入口只声明 `inject: ['slots', 'sessions', 'remote']` 就直接访问具体命名空间。当时以为拿到 `remote` 服务就等于拿到全部命名空间，但 remote 是受控代理，未点名的命名空间在首次属性访问时抛 `cannot get property "remote.workspaceFiles" without inject`
- ✅ 正确做法: 在 exports.inject 里按命名空间点名声明：`inject: ['slots', 'sessions', 'remote', 'remote.workspaceFiles']`（参照 ui-cordis 声明 `remote.dynamicCordisRunner` 的写法）
- 复发: 1 次（09-17）
- 等级: 🟡 建议
- 来源: 2026-09-17，错题本面板读取工作区文件时被 remote 代理拦截，排查约 30 分钟

## [E-002] main 插槽必须经 slots.inject 注册才能被渲染
- 触发场景: 给 DSH Web UI 注册全局面板（layout 的 `main` keyed slot）等任何要被渲染的插槽内容
- ❌ 错误做法: 在 apply 里直接 `ctx.slots.register({ name: 'main', key: ... }, Comp)`。注册不报错、selectPanel 也认账（面板能选中），但渲染器 live 账本里没有该条目，点击后只渲染空的 `data-slot-error` 死格，且无任何报错
- ✅ 正确做法: 一律走 `ctx.slots.inject('<slot>', () => ctx.slots.register({...}, Comp))`，由 inject 机制获得渲染授权并进入渲染器账本；排查渲染空白时先查 DOM 里有没有 `[data-slot-error]` 死格
- 复发: 1 次（09-17）
- 等级: 🟡 建议
- 来源: 2026-09-17，面板选中后白屏，逐步对照 ui-cordis 源码定位到渲染授权机制

