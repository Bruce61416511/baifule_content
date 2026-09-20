/**
 * 脚本解析器：把 markdown 格式的分镜脚本解析成结构化数据
 *
 * 支持的格式：
 *   # 标题
 *   总时长：35s
 *
 *   | 时间（开始 - 结束 \| 时长） & 镜头描述 | 口播文案 | 镜头构成（...） |
 *   |---|---|---|
 *   | 0:00 - 0:03 \| 3s - 演员刚做完... | 每次... | 景别：中景 / 镜头运动：固定 / 机位角度：平视 |
 *
 * 输出：{ title, totalDuration, shots: [...] }
 *
 * 镜头时长优先按"口播字数 / VOICEOVER_SPEED"推算；无口播则保留原表格时长。
 */

// 实测语速：CosyVoice longshu @ rate=1 约 4.5 字/秒
export const VOICEOVER_SPEED = 4.5

// 把 "0:03" 这种时间字符串转成秒数
function timeToSeconds(str) {
  const parts = str.trim().split(':').map(Number)
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 1 && !Number.isNaN(parts[0])) return parts[0]
  return 0
}

// 把 "景别：中景 / 镜头运动：固定 / 机位角度：平视" 拆成对象
function parseShotType(raw) {
  const result = { 景别: '', 镜头运动: '', 机位角度: '' }
  if (!raw) return result
  raw.split('/').forEach(seg => {
    const [k, v] = seg.split(/[：:]/).map(s => s && s.trim())
    if (k && v && k in result) result[k] = v
  })
  return result
}

// 把第一列 "0:00 - 0:03 | 3s - 演员刚做完一组高强度训练..." 拆开
function parseTimeAndDescription(raw) {
  if (!raw) return { start: '', end: '', duration: 0, description: '' }
  // 注意 markdown 表格里 "|" 被转义成了 "\|"，所以先还原
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

// 根据镜头描述和镜头构成合成给 r2v 的提示词
function buildShotPrompt(description, shotType) {
  const parts = []
  if (description) parts.push(description)
  const typePieces = []
  if (shotType.景别) typePieces.push(`景别${shotType.景别}`)
  if (shotType.镜头运动) typePieces.push(`镜头运动${shotType.镜头运动}`)
  if (shotType.机位角度) typePieces.push(`机位角度${shotType.机位角度}`)
  if (typePieces.length) parts.push(typePieces.join('，'))
  // 描述末尾若已有标点，不重复加句号
  return parts.reduce((acc, cur, idx) => {
    if (idx === 0) return cur
    const last = acc.slice(-1)
    if (last === '。' || last === '，' || last === '；') return acc + cur
    return acc + '。' + cur
  }, '')
}

// 解析表格行。表格行被 "|" 分割，首尾是空字符串要丢弃
function splitTableRow(line) {
  // 行首行尾的 "|" 会产生空元素，去掉
  const trimmed = line.trim().replace(/^\||\|$/g, '')
  // 不能按 "|" 简单切，因为时间列里可能有 "\|" 转义。先用占位符替换
  const ESCAPE_PLACEHOLDER = '\u0000'
  const escaped = trimmed.replace(/\\\|/g, ESCAPE_PLACEHOLDER)
  const cells = escaped.split('|').map(c => c.trim().replace(new RegExp(ESCAPE_PLACEHOLDER, 'g'), '|'))
  return cells
}

/**
 * 解析完整脚本
 * @param {string} text markdown 文本
 * @returns {{ title: string, totalDuration: number | null, shots: Array }}
 */
export function parseScript(text) {
  if (!text || !text.trim()) {
    return { title: '', totalDuration: null, shots: [] }
  }

  const lines = text.split(/\r?\n/)

  // 1. 提取标题
  let title = ''
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)$/)
    if (m) { title = m[1].trim(); break }
  }

  // 2. 提取总时长（可选）
  let totalDuration = null
  for (const line of lines) {
    const m = line.match(/总时长[：:]\s*(\d+)\s*s?/)
    if (m) { totalDuration = parseInt(m[1], 10); break }
  }

  // 3. 解析表格行
  const shots = []
  let shotIndex = 0
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    // 跳过分隔行（全是 --- 和 |）
    if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue

    const cells = splitTableRow(line)
    if (cells.length < 2) continue
    // 第一行可能是表头（包含"时间"或"镜头描述"这种字样），跳过
    if (shots.length === 0 && /时间|镜头描述|口播文案|镜头构成/.test(cells[0])) continue

    const [timeDescCell, voiceoverCell, shotTypeCell] = cells
    const { start, end, duration, description } = parseTimeAndDescription(timeDescCell)
    const shotType = parseShotType(shotTypeCell)

    // 至少要有描述或口播，否则视为无效行
    if (!description && !voiceoverCell?.trim()) continue

    shotIndex += 1
    const voiceover = (voiceoverCell || '').trim()
    const tableDuration = duration || 5

    // 镜头时长优先按口播长度推算（4.5 字/秒，向上取整）；没口播就保留原表格时长
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
      prompt: buildShotPrompt(description, shotType),
      // 运行时状态
      status: 'pending', // pending | generating | done | failed | cancelled
      taskId: null,
      videoUrl: '',
      error: '',
    })
  }

  // 4. 如果没解析到总时长，从 shots 推算
  if (totalDuration == null && shots.length > 0) {
    const last = shots[shots.length - 1]
    if (last.end) totalDuration = timeToSeconds(last.end)
  }

  // 5. 按口播推算的总时长（仅计算有口播的镜头）
  const voiceoverTotal = shots.reduce((sum, s) => sum + (s.durationSource === 'voiceover' ? s.duration : 0), 0)

  return { title, totalDuration, shots, voiceoverTotal }
}
