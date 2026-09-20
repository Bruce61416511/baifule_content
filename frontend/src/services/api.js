const BASE = '/api'

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ========== 生成任务 ==========

export const generationApi = {
  // 文生图
  t2i: (data) => request('/t2i', { method: 'POST', body: JSON.stringify(data) }),
  // 文生视频
  t2v: (data) => request('/t2v', { method: 'POST', body: JSON.stringify(data) }),
  // 首尾帧生视频
  i2v: (data) => request('/i2v', { method: 'POST', body: JSON.stringify(data) }),
  // 参考素材生视频
  r2v: (data) => request('/r2v', { method: 'POST', body: JSON.stringify(data) }),
  // 查询任务状态
  taskStatus: (taskId) => request(`/task/${taskId}`),
  // 上传文件
  upload: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/upload`, { method: 'POST', body: formData })
    if (!res.ok) throw new Error('上传失败')
    return res.json()
  },
  // 文本转语音（CosyVoice TTS）
  tts: (data) => request('/tts', { method: 'POST', body: JSON.stringify(data) }),
}

// ========== 配置 ==========

export const configApi = {
  getModels: () => request('/config/models'),
  updateModels: (data) => request('/config/models', { method: 'PUT', body: JSON.stringify(data) }),
  getPrompts: () => request('/config/prompts'),
  updatePrompts: (data) => request('/config/prompts', { method: 'PUT', body: JSON.stringify(data) }),
}

// ========== 优化 ==========

export const optimizeApi = {
  optimize: (prompt, category) =>
    request('/optimize', { method: 'POST', body: JSON.stringify({ prompt, category }) }),
  // 脚本 → 分镜列表（LLM 拆分镜 + 估时长 + 润色）
  parseScript: (rawScript) =>
    request('/parse-script', { method: 'POST', body: JSON.stringify({ raw_script: rawScript }) }),
  // 单镜头重新估时长 + 润色
  optimizeShot: ({ prompt, voiceover, duration }) =>
    request('/optimize-shot', { method: 'POST', body: JSON.stringify({ prompt, voiceover, duration }) }),
}
