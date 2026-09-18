// Host 入口：错题本的 Agent 工具 + 面板编辑命令。
// 工具（notebook_read/write/hit）：模型可调用，AI 在会话里维护错题本。
// 命令（/lessons-add/edit/remove）：面板按钮通过 commands 通道直接触发，
// 不经模型，由 Host 端改写当前工作区的 LESSONS.md。
// 浏览器面板（src/client.js）负责可视化；本文件负责数据读写。
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'lessons-md'

export const inject = ['tools', 'commands', 'systemPrompt']

// ---------- 基础工具函数 ----------

function lessonsPath(exec) {
  const cwd = exec?.agent?.session?.header?.cwd || process.cwd()
  return join(cwd, 'LESSONS.md')
}

function today() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SKELETON = `# 项目错题本 / Mistake Notebook

> 本文件由 dsh-lessons-md 插件维护：AI 会通过 notebook_write 记录新错题（重复犯错用 notebook_hit 计数），
> 人工可以直接编辑——人工编辑优先。条目格式约定见插件 README。

## 统计

- 条目数：0
- 最近更新：${new Date().toISOString().slice(0, 10)}

## 条目
`

function readNotebook(exec) {
  const file = lessonsPath(exec)
  if (!existsSync(file)) return { file, text: null }
  return { file, text: readFileSync(file, 'utf8') }
}

function nextId(text) {
  let max = 0
  for (const m of text.matchAll(/^##\s*\[E-(\d+)\]/gm)) {
    max = Math.max(max, parseInt(m[1], 10))
  }
  return `E-${String(max + 1).padStart(3, '0')}`
}

function bumpRecurrence(body) {
  const m = body.match(/-\s*复发\s*[：:]\s*(\d+)\s*次（([^）]*)）/)
  let replaced
  if (!m) {
    replaced = body.replace(/(-\s*等级\s*[：:])/, `- 复发: 1 次（${today()}）\n$1`)
    return { body: replaced, count: 1, dates: today(), upgraded: false }
  }
  const count = parseInt(m[1], 10) + 1
  const dates = m[2].trim() ? `${m[2].trim()}, ${today()}` : today()
  replaced = body.replace(/-\s*复发\s*[：:].*/, `- 复发: ${count} 次（${dates}）`)
  let upgraded = false
  if (count >= 3) {
    const wasAdvice = /-\s*等级\s*[：:]\s*🟡\s*建议/.test(replaced)
    if (wasAdvice) {
      replaced = replaced.replace(/-\s*等级\s*[：:]\s*🟡\s*建议/, '- 等级: 🔴 禁令')
      // 按上游 skill 约定留痕：升级日期行
      replaced = replaced.replace(/\s*$/, `\n- 升级: ${new Date().toISOString().slice(0, 10)} 第${count}次复发，升级为禁令\n`)
      upgraded = true
    }
  }
  return { body: replaced, count, dates, upgraded }
}

function splitEntryBlocks(text) {
  const re = /^##\s*\[E-\d+\][^\n]*$/gm
  const marks = []
  let m
  while ((m = re.exec(text)) !== null) marks.push(m.index)
  return marks.map((start, i) => {
    const end = i + 1 < marks.length ? marks[i + 1] : text.length
    return { start, end, body: text.slice(start, end) }
  })
}

function updateStats(text) {
  const count = (text.match(/^##\s*\[E-\d+\]/gm) || []).length
  const dated = text.replace(/- 条目数：\d+/, `- 条目数：${count}`)
  return dated.replace(/- 最近更新：.{0,10}/, `- 最近更新：${new Date().toISOString().slice(0, 10)}\n`)
}

// ---------- 条目编辑（命令通道共用）----------

const LEVEL_LINE = { advice: '- 等级: 🟡 建议', ban: '- 等级: 🔴 禁令' }

function setLine(body, label, value) {
  const line = `- ${label}: ${value}`
  const re = new RegExp(`-\\s*${label}\\s*[：:].*`)
  if (re.test(body)) return body.replace(re, () => line)
  // 缺行则插到标题行之后
  return body.replace(/^(##\s*\[E-\d+\][^\n]*\n)/m, (m0) => m0 + line + '\n')
}

function applyEdit(body, payload) {
  let out = body
  if (payload.title) out = out.replace(/^##\s*(\[E-\d+\])[^\n]*/m, (_m, id) => `## ${id} ${payload.title}`)
  if (payload.scene !== undefined) out = setLine(out, '触发场景', payload.scene)
  if (payload.bad !== undefined) out = setLine(out, '❌ 错误做法', payload.bad)
  if (payload.good !== undefined) out = setLine(out, '✅ 正确做法', payload.good)
  if (payload.source !== undefined) out = setLine(out, '来源', payload.source)
  if (payload.related !== undefined) out = setLine(out, '同族', payload.related)
  if (payload.level !== undefined) out = setLine(out, '等级', LEVEL_LINE[payload.level] ? LEVEL_LINE[payload.level].replace('- 等级: ', '') : payload.level)
  return out
}

function parseCommandPayload(rawInput) {
  const payload = JSON.parse(rawInput)
  if (!payload || typeof payload !== 'object') throw new Error('需要 JSON 对象参数')
  return payload
}

function addEntry(cwd, args) {
  const file = join(cwd, 'LESSONS.md')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : SKELETON
  const id = nextId(text)
  const level = args.level === 'ban' ? '🔴 禁令' : '🟡 建议'
  const entry = [
    '',
    `## [${id}] ${args.title}`,
    args.scene ? `- 触发场景: ${args.scene}` : null,
    args.bad ? `- ❌ 错误做法: ${args.bad}` : null,
    args.good ? `- ✅ 正确做法: ${args.good}` : null,
    args.related ? `- 同族: ${args.related}` : null,
    `- 复发: 1 次（${today()}）`,
    `- 等级: ${level}`,
    `- 来源: ${new Date().toISOString().slice(0, 10)}${args.source ? '，' + args.source : ''}`,
    '',
  ].filter((line) => line !== null).join('\n')
  let next = text.replace(/\s*$/, '\n') + entry
  // 同族双向互链：老条目回链新 ID
  if (args.related) {
    const rel = String(args.related).toUpperCase()
    const blocks = splitEntryBlocks(next)
    const hit = blocks.find((b) => b.body.includes(`[${rel}]`))
    if (hit) {
      const linked = hit.body.replace(/\s*$/, `\n- 同族: ${id}\n`)
      next = next.slice(0, hit.start) + linked + next.slice(hit.end)
    }
  }
  writeFileSync(file, updateStats(next))
  return `已记录错题 [${id}] ${args.title}（${level}）到 ${file}` + (args.related ? `，已与 ${String(args.related).toUpperCase()} 互标同族` : '')
}

// ---------- 工具注册 ----------

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'notebook_read',
    description: '读取当前工作区的错题本（LESSONS.md）全文。开始任务前调用它可以避开项目已知的坑；完成任务后发现新坑时用 notebook_write 记录。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      const { file, text } = readNotebook(exec)
      if (text === null) return `（当前工作区还没有错题本：${file}。发现值得记住的错误时，用 notebook_write 记录。）`
      return text
    },
  }))

  ctx.tools.register(defineTool({
    name: 'notebook_write',
    description: '向当前工作区错题本追加一条新错题。调用前先 notebook_read 查重：若本次错误与已有条目实质相同（触发场景和错误做法一样），改用 notebook_hit 给已有条目计数；同根因但修法不同时才新建，并用 related 参数互标同族。在用户纠正你、或你反复重试后终于成功时调用。',
    parameters: {
      title: { type: 'string', required: true, description: '一句话说清这个错误（祈使句），如"禁止为编辑器启动独立进程"' },
      scene: { type: 'string', description: '触发场景：什么样的任务会踩这个坑' },
      bad: { type: 'string', description: '❌ 错误做法：当时做错了什么、为什么' },
      good: { type: 'string', description: '✅ 正确做法：下次应该怎么做' },
      source: { type: 'string', description: '来源背景：哪次会话/什么任务中发现' },
      level: { type: 'string', enum: ['advice', 'ban'], description: '等级：advice=建议（默认），ban=禁令' },
      related: { type: 'string', description: '同族条目编号（如 E-002）：本次错误与它同根因但修法不同。会双向互标 - 同族 行' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd()
      return addEntry(cwd, args)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'notebook_hit',
    description: '给指定编号的错题标记一次复发（复发计数 +1，并追加今天日期）。复发满 3 次的条目会自动从 🟡 建议升级为 🔴 禁令。',
    parameters: {
      id: { type: 'string', required: true, description: '错题编号，如 "E-002"' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const { file, text } = readNotebook(exec)
      if (text === null) return `当前工作区没有错题本（${file}），无法标记复发。`
      const blocks = splitEntryBlocks(text)
      const target = args.id.toUpperCase().replace(/^#*/, '')
      const hit = blocks.find((b) => b.body.includes(`[${target}]`))
      if (!hit) return `错题本里没有找到编号 ${target}。可用的编号：${(text.match(/\[E-\d+\]/g) || []).join(', ') || '（无）'}`
      const bumped = bumpRecurrence(hit.body)
      writeFileSync(file, updateStats(text.slice(0, hit.start) + bumped.body + text.slice(hit.end)))
      return `错题 ${target} 复发计数已 +1（现为 ${bumped.count} 次）${bumped.upgraded ? '，已自动升级为 🔴 禁令并留痕' : ''}。`
    },
  }))

  console.log('[lessons-md] tools registered: notebook_read, notebook_write, notebook_hit')

  // ---------- 面板编辑命令（client 通过 commands remote 直接触发，不经模型）----------
  function commandError(action) {
    return (e) => ({ kind: 'error', text: `lessons-${action} 失败: ${String(e && e.message || e)}` })
  }

  ctx.commands.register({
    name: 'lessons-add',
    description: 'lessons-md: 向当前工作区错题本添加一条错题（面板按钮调用）',
    input: { hint: '<json>' },
    handler: ({ agent, rawInput }) => {
      try {
        const payload = parseCommandPayload(rawInput)
        if (!payload.title) return { kind: 'error', text: 'lessons-add: 缺少 title 字段' }
        const cwd = agent?.session?.header?.cwd || process.cwd()
        return { kind: 'success', text: addEntry(cwd, payload) }
      } catch (e) { return commandError('add')(e) }
    },
  })

  ctx.commands.register({
    name: 'lessons-edit',
    description: 'lessons-md: 编辑当前工作区错题本的一条错题（面板按钮调用）',
    input: { hint: '<json>' },
    handler: ({ agent, rawInput }) => {
      try {
        const payload = parseCommandPayload(rawInput)
        if (!payload.id) return { kind: 'error', text: 'lessons-edit: 缺少 id 字段' }
        const cwd = agent?.session?.header?.cwd || process.cwd()
        const file = join(cwd, 'LESSONS.md')
        if (!existsSync(file)) return { kind: 'error', text: `当前工作区没有错题本（${file}）` }
        const text = readFileSync(file, 'utf8')
        const blocks = splitEntryBlocks(text)
        const target = String(payload.id).toUpperCase()
        const hit = blocks.find((b) => b.body.includes(`[${target}]`))
        if (!hit) return { kind: 'error', text: `错题本里没有找到编号 ${target}` }
        const updated = applyEdit(hit.body, payload)
        writeFileSync(file, updateStats(text.slice(0, hit.start) + updated + text.slice(hit.end)))
        return { kind: 'success', text: `已更新错题 ${target}` }
      } catch (e) { return commandError('edit')(e) }
    },
  })

  ctx.commands.register({
    name: 'lessons-remove',
    description: 'lessons-md: 从当前工作区错题本删除一条错题（面板按钮调用）',
    input: { hint: '<id>' },
    handler: ({ agent, rawInput }) => {
      try {
        const target = String(rawInput || '').trim().toUpperCase()
        if (!target) return { kind: 'error', text: 'lessons-remove: 缺少条目编号，如 E-001' }
        const cwd = agent?.session?.header?.cwd || process.cwd()
        const file = join(cwd, 'LESSONS.md')
        if (!existsSync(file)) return { kind: 'error', text: `当前工作区没有错题本（${file}）` }
        const text = readFileSync(file, 'utf8')
        const blocks = splitEntryBlocks(text)
        const hit = blocks.find((b) => b.body.includes(`[${target}]`))
        if (!hit) return { kind: 'error', text: `错题本里没有找到编号 ${target}` }
        const next = (text.slice(0, hit.start) + text.slice(hit.end)).replace(/^\n+/, '\n')
        writeFileSync(file, updateStats(next))
        return { kind: 'success', text: `已删除错题 ${target}` }
      } catch (e) { return commandError('remove')(e) }
    },
  })

  ctx.commands.register({
    name: 'lessons-init',
    description: 'lessons-md: 在当前工作区初始化错题本（面板空态按钮调用）',
    handler: ({ agent }) => {
      try {
        const cwd = agent?.session?.header?.cwd || process.cwd()
        const file = join(cwd, 'LESSONS.md')
        if (existsSync(file)) return { kind: 'error', text: `当前工作区已有错题本（${file}）` }
        writeFileSync(file, SKELETON)
        return { kind: 'success', text: `已创建错题本 ${file}` }
      } catch (e) { return commandError('init')(e) }
    },
  })

  console.log('[lessons-md] commands registered: /lessons-add, /lessons-edit, /lessons-remove, /lessons-init')

  // ---------- 系统提示注入：会话开场自动提醒（零配置核心）----------
  // 静态文本（不随条目数变化）以保护提示词 KV cache；
  // 让模型自己调 notebook_read 并报数，而不是把错题本内容塞进系统提示。
  try {
    ctx.systemPrompt.section({
      name: 'lessons-md:session-reminder',
      order: 9500,
      text: 'Mistake Notebook (lessons-md) is active for this workspace. Before starting any task, call the notebook_read tool to load the workspace LESSONS.md and reply one line "Notebook read (N entries)" as confirmation. When an operation matches an entry\u2019s trigger scene, re-read it first; entries marked \uD83D\uDD34 Ban are unconditional \u2014 stop and explain before violating one. After a user correction or a repeated failure, call notebook_write (new entry, dedupe first) or notebook_hit (recurrence +1) to keep the notebook current.',
    })
    console.log('[lessons-md] system prompt section registered: lessons-md:session-reminder')
  } catch (e) {
    console.log('[lessons-md] system prompt injection unavailable: ' + String(e).slice(0, 120))
  }
}
