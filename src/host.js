// Host 入口：错题本的 Agent 工具集。
// 注册三个模型可调用的工具，让 DSH 的 AI 能在会话里直接读写当前工作区的 LESSONS.md：
//   notebook_read  —— 读取错题本全文（模型可见）
//   notebook_write —— 追加一条新错题
//   notebook_hit   —— 某条错题复发 +1（满 3 次自动升级为 🔴 禁令）
// 浏览器面板（src/client.js）负责可视化；本文件负责数据读写。
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'mistake-notebook'

export const inject = ['tools']

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
      const { file, text } = readNotebook(exec)
      const base = text === null ? SKELETON : text
      const id = nextId(base)
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
      writeFileSync(file, updateStats(base.replace(/\s*$/, '\n') + entry))
      return `已记录错题 [${id}] ${args.title}（${level}）到 ${file}`
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
}
