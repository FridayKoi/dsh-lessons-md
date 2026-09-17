// Host 入口：错题本的 Agent 工具 + 面板编辑命令。
// 工具（notebook_read/write/hit）：模型可调用，AI 在会话里维护错题本。
// 命令（/lessons-add/edit/remove）：面板按钮通过 commands 通道直接触发，
// 不经模型，由 Host 端改写当前工作区的 LESSONS.md。
// 浏览器面板（src/client.js）负责可视化；本文件负责数据读写。
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'mistake-notebook'

export const inject = ['tools', 'commands']

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

> 本文件由 mistake-notebook 插件维护：AI 会通过 notebook_write 记录新错题，
> 通过 notebook_hit 给复发条目计数。人类可以直接编辑。

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
  if (!m) return body.replace(/(-\s*等级\s*[：:])/, `- 复发: 1 次（${today()}）\n$1`)
  const count = parseInt(m[1], 10) + 1
  const dates = m[2].trim() ? `${m[2].trim()}, ${today()}` : today()
  let replaced = body.replace(/-\s*复发\s*[：:].*/, `- 复发: ${count} 次（${dates}）`)
  if (count >= 3) replaced = replaced.replace(/-\s*等级\s*[：:]\s*🟡\s*建议/, '- 等级: 🔴 禁令')
  return replaced
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
    `- 复发: 1 次（${today()}）`,
    `- 等级: ${level}`,
    `- 来源: ${new Date().toISOString().slice(0, 10)}${args.source ? '，' + args.source : ''}`,
    '',
  ].filter((line) => line !== null).join('\n')
  writeFileSync(file, updateStats(text.replace(/\s*$/, '\n') + entry))
  return `已记录错题 [${id}] ${args.title}（${level}）到 ${file}`
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
    description: '向当前工作区错题本追加一条新错题。在用户纠正你的错误、或你反复重试后终于成功时调用，避免同一个坑踩第二次。',
    parameters: {
      title: { type: 'string', required: true, description: '一句话说清这个错误（祈使句），如"禁止为编辑器启动独立进程"' },
      scene: { type: 'string', description: '触发场景：什么样的任务会踩这个坑' },
      bad: { type: 'string', description: '❌ 错误做法：当时做错了什么、为什么' },
      good: { type: 'string', description: '✅ 正确做法：下次应该怎么做' },
      source: { type: 'string', description: '来源背景：哪次会话/什么任务中发现' },
      level: { type: 'string', enum: ['advice', 'ban'], description: '等级：advice=建议（默认），ban=禁令' },
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
      const updated = bumpRecurrence(hit.body)
      const count = (updated.match(/-\s*复发\s*[：:]\s*(\d+)/) || [])[1]
      const levelUp = count >= 3 && updated.includes('🔴 禁令') && !hit.body.includes('🔴 禁令')
      const next = text.slice(0, hit.start) + updated + text.slice(hit.end)
      writeFileSync(file, updateStats(next))
      return `错题 ${target} 复发计数已 +1（现为 ${count} 次）${levelUp ? '，已自动升级为 🔴 禁令' : ''}。`
    },
  }))

  console.log('[mistake-notebook] tools registered: notebook_read, notebook_write, notebook_hit')

  // ---------- 面板编辑命令（client 通过 commands remote 直接触发，不经模型）----------
  function commandError(action) {
    return (e) => ({ kind: 'error', text: `lessons-${action} 失败: ${String(e && e.message || e)}` })
  }

  ctx.commands.register({
    name: 'lessons-add',
    description: 'mistake-notebook: 向当前工作区错题本添加一条错题（面板按钮调用）',
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
    description: 'mistake-notebook: 编辑当前工作区错题本的一条错题（面板按钮调用）',
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
    description: 'mistake-notebook: 从当前工作区错题本删除一条错题（面板按钮调用）',
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

  console.log('[mistake-notebook] commands registered: /lessons-add, /lessons-edit, /lessons-remove')
}
