/**
 * 脚本解析器：把 markdown 格式的分镜脚本解析成结构化数据
 *
 * 主入口 parseScript(text) 优先调 LLM（拆分镜 + 估时长 + 润色文字）。
 * LLM 不可用或返回非法数据时，降级到本地正则 parseScriptLocal(text)。
 *
 * 本地解析的镜头时长优先按"口播字数 / VOICEOVER_SPEED"推算；无口播则保留原表格时长。
 */

import { optimizeApi } from './api'

// 实测语速：CosyVoice longshu @ rate=1 约 4.5 字/秒
export const VOICEOVER_SPEED = 4.5

// ===== 主入口：LLM 拆分镜 + 估时长 + 润色 =====

/**
 * 解析完整脚本（async）
 * 优先调 LLM；LLM 失败时降级到本地正则。
 * @param {string} text markdown 文本
 * @returns {{ title: string, totalDuration: number | null, shots: Array, voiceoverTotal: number }}
 */
export async function parseScript(text) {
  if (!text || !text.trim()) {
    return { title: '', totalDuration: null, shots: [], voiceoverTotal: 0 }
  }

  // 1. 先尝试 LLM
  try {
    const res = await optimizeApi.parseScript(text)
    const llmShots = Array.isArray(res?.shots) ? res.shots : null
    if (llmShots && llmShots.length > 0) {
      return buildResultFromLlm(text, llmShots)
    }
  } catch (err) {
    console.warn('[parser] LLM 解析失败，降级到本地正则:', err.message)
  }

  // 2. 降级到本地正则
  return parseScriptLocal(text)
}

// LLM 返回的数组 → 和 parseScriptLocal 同结构的 shot 对象
function buildResultFromLlm(rawScript, llmShots) {
  // 从原文里抠标题和总时长（LLM 不返回这两个字段，前端自己提取）
  const lines = rawScript.split(/\r?\n/)
  let title = ''
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)$/)
    if (m) { title = m[1].trim(); break }
  }
  let totalDuration = null
  for (const line of lines) {
    const m = line.match(/总时长[：:]\s*(\d+)\s*s?/)
    if (m) { totalDuration = parseInt(m[1], 10); break }
  }

  const shots = llmShots.map((s, i) => ({
    id: `shot-${i + 1}`,
    index: i + 1,
    start: '',
    end: '',
    duration: Number(s.duration) || 5,
    description: '',           // LLM 已经把描述、镜头规格都润色进 prompt，无需再单独保留
    voiceover: s.voiceover || '',
    shotType: { 景别: '', 镜头运动: '', 机位角度: '' },
    prompt: s.prompt || '',
    // 运行时状态
    status: 'pending',
    taskId: null,
    videoUrl: '',
    error: '',
  }))

  // 如果脚本里有总时长就沿用，没有就按 shots 累加
  if (totalDuration == null && shots.length > 0) {
    totalDuration = shots.reduce((sum, s) => sum + (Number(s.duration) || 0), 0)
  }
  const voiceoverTotal = shots.reduce((sum, s) => sum + (s.duration || 0), 0)

  return { title, totalDuration, shots, voiceoverTotal }
}

// ===== 本地正则解析（LLM 失败时的降级）=====

function timeToSeconds(str) {
  const parts = str.trim().split(':').map(Number)
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 1 && !Number.isNaN(parts[0])) return parts[0]
  return 0
}

function parseShotType(raw) {
  const result = { 景别: '', 镜头运动: '', 机位角度: '' }
  if (!raw) return result
  raw.split('/').forEach(seg => {
    const [k, v] = seg.split(/[：:]/).map(s => s && s.trim())
    if (k && v && k in result) result[k] = v
  })
  return result
}

function parseTimeAndDescription(raw) {
  if (!raw) return { start: '', end: '', duration: 0, description: '' }
  const normalized = raw.replace(/\\\|/g, '|')
  const m = normalized.match(/^\s*(\d+:\d+)\s*-\s*(\d+:\d+)\s*\|\s*(\d+)s?\s*-\s*(.+)$/)
  if (!m) {
    return { start: '', end: '', duration: 0, description: raw.trim() }
  }
  return {
    start: m[1],
    end: m[2],
    duration: parseInt(m[3], 10) || 0,
    description: m[4].trim(),
  }
}

// 本地正则版：description + voiceover + shotType 拼成 prompt
// （LLM 路径不需要，因为 LLM 已经直接输出完整 prompt）
function buildShotPrompt(description, shotType, voiceover) {
  const parts = []
  if (description) parts.push(description)
  if (voiceover) {
    const safeVoice = voiceover.replace(/'/g, '‘').replace(/"/g, '“')
    parts.push(`并说道：'${safeVoice}'`)
  }
  const typePieces = []
  if (shotType.景别) typePieces.push(`景别${shotType.景别}`)
  if (shotType.镜头运动) typePieces.push(`镜头运动${shotType.镜头运动}`)
  if (shotType.机位角度) typePieces.push(`机位角度${shotType.机位角度}`)
  if (typePieces.length) parts.push(typePieces.join('，'))
  return parts.reduce((acc, cur, idx) => {
    if (idx === 0) return cur
    const last = acc.slice(-1)
    if (last === '。' || last === '，' || last === '；') return acc + cur
    return acc + '。' + cur
  }, '')
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\||\|$/g, '')
  const ESCAPE_PLACEHOLDER = '\u0000'
  const escaped = trimmed.replace(/\\\|/g, ESCAPE_PLACEHOLDER)
  const cells = escaped.split('|').map(c => c.trim().replace(new RegExp(ESCAPE_PLACEHOLDER, 'g'), '|'))
  return cells
}

/**
 * 本地正则解析（LLM 失败时的降级）
 */
export function parseScriptLocal(text) {
  if (!text || !text.trim()) {
    return { title: '', totalDuration: null, shots: [], voiceoverTotal: 0 }
  }

  const lines = text.split(/\r?\n/)

  let title = ''
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)$/)
    if (m) { title = m[1].trim(); break }
  }

  let totalDuration = null
  for (const line of lines) {
    const m = line.match(/总时长[：:]\s*(\d+)\s*s?/)
    if (m) { totalDuration = parseInt(m[1], 10); break }
  }

  const shots = []
  let shotIndex = 0
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue

    const cells = splitTableRow(line)
    if (cells.length < 2) continue
    if (shots.length === 0 && /时间|镜头描述|口播文案|镜头构成/.test(cells[0])) continue

    const [timeDescCell, voiceoverCell, shotTypeCell] = cells
    const { start, end, duration, description } = parseTimeAndDescription(timeDescCell)
    const shotType = parseShotType(shotTypeCell)

    if (!description && !voiceoverCell?.trim()) continue

    shotIndex += 1
    const voiceover = (voiceoverCell || '').trim()
    const tableDuration = duration || 5

    let effectiveDuration = tableDuration
    let durationSource = 'table'
    if (voiceover) {
      const chars = voiceover.replace(/[，。！？、；：""''…—\s]/g, '').length || voiceover.length
      const voiceoverDur = Math.ceil(chars / VOICEOVER_SPEED)
      if (voiceoverDur >= 2) {
        effectiveDuration = voiceoverDur
        durationSource = 'voiceover'
      }
    }

    shots.push({
      id: `shot-${shotIndex}`,
      index: shotIndex,
      start,
      end,
      duration: effectiveDuration,
      originalDuration: tableDuration,
      durationSource,
      description,
      voiceover,
      shotType,
      prompt: buildShotPrompt(description, shotType, voiceover),
      status: 'pending',
      taskId: null,
      videoUrl: '',
      error: '',
    })
  }

  if (totalDuration == null && shots.length > 0) {
    const last = shots[shots.length - 1]
    if (last.end) totalDuration = timeToSeconds(last.end)
  }

  const voiceoverTotal = shots.reduce((sum, s) => sum + (s.durationSource === 'voiceover' ? s.duration : 0), 0)

  return { title, totalDuration, shots, voiceoverTotal }
}
