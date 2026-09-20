import { useState, useRef } from 'react'
import { generationApi, optimizeApi } from '../services/api'
import {
  showMessage, textareaStyle, inputStyle, btnPrimary, btnSecondary, labelStyle, cardStyle,
  shotCardStyle, shotHeaderStyle, shotStatusBadgeStyle, shotBorderColor,
  progressBarContainerStyle, progressBarFillStyle, scriptTextareaStyle,
} from '../services/ui'
import { parseScript } from '../services/parser'

const RESOLUTION_OPTIONS = [{ label: '480P', value: '480P' }, { label: '720P', value: '720P' }, { label: '1080P', value: '1080P' }]
const RATIO_OPTIONS = [{ label: '16:9 (横版)', value: '16:9' }, { label: '9:16 (竖版)', value: '9:16' }, { label: '1:1 (方形)', value: '1:1' }]
const MEDIA_TYPE_OPTIONS = [{ label: '角色参考', value: 'reference_image' }, { label: '首帧', value: 'first_frame' }]
const MAX_IMAGES = 4

const SAMPLE_SCRIPT = `# 练后酸痛不想动？别傻喝蛋白粉了，试试这个！
总时长：35s

| 时间（开始 - 结束 \\| 时长） & 镜头描述 | 口播文案 | 镜头构成（景别 / 镜头运动 / 机位角度） |
|---|---|---|
| 0:00 - 0:03 \\| 3s - 演员刚做完一组高强度训练（如：深蹲或俯卧撑），坐在瑜伽垫上，用毛巾擦汗，表情略显疲惫但满足。 | 每次高强度练完，感觉身体被掏空的时候… | 景别：中景 / 镜头运动：固定 / 机位角度：平视 |
| 0:03 - 0:06 \\| 3s - 演员从健身包里拿东西，镜头给到包内特写，她的手推开一个蛋白粉摇摇杯，转而拿出一袋紫色的百芙乐蓝莓饮。 | 我不会立马就去灌蛋白粉。 | 景别：近景到特写 / 镜头运动：手动跟焦 / 机位角度：俯视 |
| 0:06 - 0:10 \\| 4s - 快速闪回镜头：一瓶市售含糖果汁、一瓶普通矿泉水，画面上快速划过红色的"X"。然后切回演员，她对着镜头摇了摇手里的蓝莓饮。 | 喝那些糖水饮料就更别提了。想恢复快又不给身体添负担，得喝点聪明的。 | 景别：近景 / 镜头运动：快速切换 / 机位角度：平视 |
`

export default function RefVideo() {
  // ===== 全局素材 =====
  const [images, setImages] = useState([])
  const [audioFile, setAudioFile] = useState(null)
  const [imageUrlInput, setImageUrlInput] = useState('')

  // ===== 分镜脚本 =====
  const [rawScript, setRawScript] = useState('')
  const [scriptTitle, setScriptTitle] = useState('')
  const [scriptTotalDuration, setScriptTotalDuration] = useState(null)
  const [voiceoverTotal, setVoiceoverTotal] = useState(0)
  const [shots, setShots] = useState([])

  // ===== 全局参数 & 批量生成 =====
  const [resolution, setResolution] = useState('720P')
  const [ratio, setRatio] = useState('16:9')
  const [batchRunning, setBatchRunning] = useState(false)
  const [optimizingShotIds, setOptimizingShotIds] = useState(new Set())
  const [parsingScript, setParsingScript] = useState(false)
  const pollRef = useRef({})         // shotId -> intervalId
  const cancelRef = useRef(false)    // 取消批量生成的信号

  // ===== 单镜头提示词优化（调 LLM：重新估时长 + 润色）=====
  const handleOptimizeShot = async (shotId) => {
    const shot = shots.find(s => s.id === shotId)
    if (!shot || !shot.prompt.trim()) return showMessage('warning', '该分镜的提示词为空')
    setOptimizingShotIds(prev => new Set(prev).add(shotId))
    try {
      const res = await optimizeApi.optimizeShot({
        prompt: shot.prompt,
        voiceover: shot.voiceover || '',
        duration: shot.duration,
      })
      const patch = { prompt: res.prompt }
      if (res.duration && res.duration !== shot.duration) {
        patch.duration = res.duration
      }
      updateShot(shotId, patch)
      showMessage('success', `#${shot.index} 已优化${res.duration !== shot.duration ? `（时长 ${shot.duration}s → ${res.duration}s）` : ''}`)
    } catch (e) {
      showMessage('error', '优化失败: ' + e.message)
    } finally {
      setOptimizingShotIds(prev => {
        const next = new Set(prev)
        next.delete(shotId)
        return next
      })
    }
  }

  // ===== 批量优化所有分镜（串行：每镜重新估时长 + 润色）=====
  const handleOptimizeAll = async () => {
    if (shots.length === 0) return
    const targets = shots.filter(s => s.prompt.trim())
    if (targets.length === 0) return showMessage('warning', '所有分镜的提示词都为空')
    setOptimizingShotIds(new Set(targets.map(s => s.id)))
    let successCount = 0
    let failCount = 0
    let durationChanged = 0
    for (const shot of targets) {
      try {
        const res = await optimizeApi.optimizeShot({
          prompt: shot.prompt,
          voiceover: shot.voiceover || '',
          duration: shot.duration,
        })
        const patch = { prompt: res.prompt }
        if (res.duration && res.duration !== shot.duration) {
          patch.duration = res.duration
          durationChanged++
        }
        updateShot(shot.id, patch)
        successCount++
      } catch (e) {
        failCount++
      }
    }
    setOptimizingShotIds(new Set())
    showMessage(failCount === 0 ? 'success' : 'warning',
      `优化完成：成功 ${successCount} 个${durationChanged > 0 ? `，其中 ${durationChanged} 个时长被调整` : ''}${failCount > 0 ? `，失败 ${failCount} 个` : ''}`)
  }

  // ===== 更新单个镜头状态的辅助函数 =====
  const updateShot = (id, patch) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  // ===== 文件上传 =====
  const handleImageUpload = async (file) => {
    if (images.length >= MAX_IMAGES) return showMessage('warning', `最多上传 ${MAX_IMAGES} 张`)
    try {
      const res = await generationApi.upload(file)
      setImages(prev => [...prev, { url: res.url, preview: URL.createObjectURL(file), type: 'reference_image', name: file.name }])
      showMessage('success', '图片上传成功')
    } catch (e) { showMessage('error', '上传失败') }
  }

  // ===== 通过公网 URL 添加图片（绕过本地上传，供 DashScope 直接拉图）=====
  const handleAddImageByUrl = () => {
    const url = imageUrlInput.trim()
    if (!url) return showMessage('warning', '请粘贴图片 URL')
    if (!/^https?:\/\//i.test(url)) return showMessage('warning', 'URL 必须以 http:// 或 https:// 开头')
    if (images.length >= MAX_IMAGES) return showMessage('warning', `最多 ${MAX_IMAGES} 张`)
    // 从 URL 最后一段抓个文件名展示
    const name = url.split('/').pop().split('?')[0] || 'url-image'
    setImages(prev => [...prev, { url, preview: url, type: 'reference_image', name }])
    setImageUrlInput('')
    showMessage('success', '已通过 URL 添加图片（DashScope 可直接拉取）')
  }

  const handleAudioUpload = async (file) => {
    try {
      const res = await generationApi.upload(file)
      setAudioFile({ url: res.url, preview: URL.createObjectURL(file), name: file.name })
      showMessage('success', '音频上传成功')
    } catch (e) { showMessage('error', '上传失败') }
  }

  // ===== 脚本解析（LLM 拆分镜 + 估时长 + 润色；失败降级到本地正则）=====
  const handleParseScript = async () => {
    if (!rawScript.trim()) return showMessage('warning', '请先粘贴脚本内容')
    if (shots.length > 0 && shots.some(s => s.status === 'done')) {
      if (!window.confirm('重新解析会清空当前分镜和已生成的视频，确定继续？')) return
    }
    setParsingScript(true)
    try {
      const parsed = await parseScript(rawScript)
      if (parsed.shots.length === 0) {
        return showMessage('error', '未解析到任何分镜，请检查表格格式')
      }
      setScriptTitle(parsed.title)
      setScriptTotalDuration(parsed.totalDuration)
      setVoiceoverTotal(parsed.voiceoverTotal || 0)
      setShots(parsed.shots)
      showMessage('success', `已解析 ${parsed.shots.length} 个分镜（AI 已估算每镜时长并润色提示词）`)
    } catch (e) {
      showMessage('error', '解析失败: ' + e.message)
    } finally {
      setParsingScript(false)
    }
  }

  const handleLoadSample = () => {
    setRawScript(SAMPLE_SCRIPT)
    showMessage('info', '已载入示例脚本，点击"解析脚本"查看效果')
  }

  const handleClearScript = () => {
    if (shots.length > 0 && shots.some(s => s.status === 'done')) {
      if (!window.confirm('清空脚本会同时清空已生成的视频，确定继续？')) return
    }
    setRawScript('')
    setScriptTitle('')
    setScriptTotalDuration(null)
    setVoiceoverTotal(0)
    setShots([])
  }

  // ===== 单镜头生成 =====
  const generateOneShot = (shot) => {
    return new Promise((resolve) => {
      if (cancelRef.current) {
        updateShot(shot.id, { status: 'cancelled' })
        return resolve({ cancelled: true })
      }

      // 构造 media：全局参考图 + 音色样本（reference_voice 是 media 元素的字段，不是独立项）
      // 文档："该音频仅参考音色，与说话内容无关"，1-10 秒即可，挂在第一张参考图上
      const media = images.map((img, i) => {
        const item = { type: img.type, url: img.url }
        if (i === 0 && audioFile) item.reference_voice = audioFile.url
        return item
      })

      if (images.length === 0) {
        showMessage('warning', '请先上传至少一张参考图')
        updateShot(shot.id, { status: 'failed', error: '未上传参考图' })
        return resolve({ failed: true })
      }

      updateShot(shot.id, { status: 'generating', error: '' })

      generationApi.r2v({
        prompt: shot.prompt,
        media,
        resolution,
        ratio,
        duration: shot.duration,
      })
        .then(res => {
          updateShot(shot.id, { taskId: res.task_id })
          // 轮询
          const intervalId = setInterval(async () => {
            try {
              const data = await generationApi.taskStatus(res.task_id)
              if (data.status === 'SUCCEEDED') {
                clearInterval(intervalId)
                delete pollRef.current[shot.id]
                updateShot(shot.id, { status: 'done', videoUrl: data.output?.video_url || '' })
                resolve({ done: true })
              } else if (data.status === 'FAILED') {
                clearInterval(intervalId)
                delete pollRef.current[shot.id]
                updateShot(shot.id, { status: 'failed', error: 'DashScope 任务失败' })
                resolve({ failed: true })
              }
            } catch (e) {
              clearInterval(intervalId)
              delete pollRef.current[shot.id]
              updateShot(shot.id, { status: 'failed', error: e.message })
              resolve({ failed: true })
            }
          }, 3000)
          pollRef.current[shot.id] = intervalId
        })
        .catch(e => {
          updateShot(shot.id, { status: 'failed', error: e.message })
          resolve({ failed: true })
        })
    })
  }

  const handleGenerateShot = async (shotId) => {
    const shot = shots.find(s => s.id === shotId)
    if (!shot) return
    if (shot.status === 'generating') return
    if (!shot.prompt.trim()) return showMessage('warning', '该分镜的提示词为空')
    await generateOneShot(shot)
  }

  // ===== 一键生成全部（串行） =====
  const handleGenerateAll = async () => {
    if (shots.length === 0) return showMessage('warning', '请先解析脚本')
    if (images.length === 0) return showMessage('warning', '请先上传至少一张参考图')
    const pendingShots = shots.filter(s => s.status === 'pending' || s.status === 'failed')
    if (pendingShots.length === 0) return showMessage('info', '所有分镜都已生成完成')

    cancelRef.current = false
    setBatchRunning(true)
    try {
      for (const shot of pendingShots) {
        if (cancelRef.current) {
          updateShot(shot.id, { status: 'cancelled' })
          continue
        }
        await generateOneShot(shot)
      }
      const finalShots = shots // 注意闭包拿不到最新值，改用 setShots 回调统计
      showMessage('success', '批量生成完成')
    } catch (e) {
      showMessage('error', '批量生成出错: ' + e.message)
    } finally {
      setBatchRunning(false)
    }
  }

  const handleCancelBatch = () => {
    cancelRef.current = true
    showMessage('info', '已发送取消信号，当前正在生成的镜头会跑完')
  }

  // ===== 统计 =====
  const doneCount = shots.filter(s => s.status === 'done').length
  const failedCount = shots.filter(s => s.status === 'failed').length
  const progressRatio = shots.length > 0 ? (doneCount + failedCount) / shots.length : 0

  // ===== 渲染 =====
  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#142528' }}>参考视频 · 脚本分镜模式</h2>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>粘贴完整脚本 → 一键拆成分镜 → 串行生成每段视频 → 拼接成片</span>
      </div>

      {/* ===== 卡片 1：全局素材 ===== */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>📷 参考图（所有镜头共用，最多 {MAX_IMAGES} 张）</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {images.map((img, i) => (
            <div key={i} style={{ width: 140, border: '1px solid #e2eeea', borderRadius: 10, overflow: 'hidden', background: '#fafffe' }}>
              <img src={img.preview} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: 100, objectFit: 'cover' }} />
              <div style={{ padding: 8 }}>
                <select value={img.type} onChange={e => setImages(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} style={{ ...inputStyle, width: '100%', marginBottom: 6, padding: '4px 8px', fontSize: 12 }}>
                  {MEDIA_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</div>
                <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} style={{ marginTop: 4, padding: '2px 8px', borderRadius: 4, border: '1px solid #c53030', background: '#fff', color: '#c53030', cursor: 'pointer', fontSize: 11 }}>移除</button>
              </div>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <label style={{ width: 140, height: 160, border: '1px dashed #dce9e7', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa' }}>
              <div style={{ fontSize: 28, color: '#005d50' }}>+</div>
              <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>上传本地图片</div>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0])} />
            </label>
          )}
        </div>
        {images.length < MAX_IMAGES && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="或粘贴图片公网 URL（如 https://...png）"
              value={imageUrlInput}
              onChange={e => setImageUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddImageByUrl() }}
              style={{ ...inputStyle, flex: 1, fontSize: 12 }}
            />
            <button onClick={handleAddImageByUrl} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
              添加 URL
            </button>
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>🎵 音色样本（所有镜头共用，选填）</div>
          {!audioFile && (
            <label style={{ ...btnSecondary, cursor: 'pointer', padding: '6px 14px', fontSize: 12 }}>
              + 上传音频文件
              <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleAudioUpload(e.target.files[0])} />
            </label>
          )}
        </div>

        {audioFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fafffe', border: '1px solid #e2eeea', borderRadius: 10 }}>
            <span style={{ fontSize: 20 }}>🎵</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{audioFile.name}</div>
              <audio src={audioFile.preview} controls style={{ height: 28, marginTop: 4, width: '100%' }} />
            </div>
            <button onClick={() => setAudioFile(null)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #c53030', background: '#fff', color: '#c53030', cursor: 'pointer', fontSize: 12 }}>移除</button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            上传一段 1-10 秒的音频，让模型参考演员的音色（与说话内容无关，台词写在分镜提示词里）。wav/mp3，≤15MB。不上传则不传。
          </div>
        )}
      </div>

      {/* ===== 卡片 2：脚本输入 ===== */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>📜 分镜脚本（Markdown 表格）</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleLoadSample} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}>载入示例</button>
            <button onClick={handleClearScript} disabled={batchRunning} style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12, borderColor: '#c53030', color: '#c53030' }}>清空</button>
          </div>
        </div>

        {scriptTitle && shots.length > 0 && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f5fbfa', border: '1px solid #dce9e7', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#005d50', marginBottom: 4 }}>{scriptTitle}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                共 {shots.length} 个分镜
                {scriptTotalDuration ? ` · 脚本原时长 ${scriptTotalDuration}s` : ''}
                {voiceoverTotal > 0 && (
                  <span>
                    {' · '}
                    分镜累计
                    <span style={{ fontWeight: 700, color: scriptTotalDuration && voiceoverTotal !== scriptTotalDuration ? '#b45309' : '#0d7a5f', marginLeft: 2 }}>
                      {voiceoverTotal}s
                    </span>
                    {scriptTotalDuration && voiceoverTotal !== scriptTotalDuration && (
                      <span style={{ color: '#b45309' }}>
                        {' '}（AI 按动作+台词+留白重新估算，与原脚本差 {voiceoverTotal - scriptTotalDuration > 0 ? '+' : ''}{voiceoverTotal - scriptTotalDuration}s）
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              ✅ {doneCount} 完成 · ❌ {failedCount} 失败 · ⏳ {shots.length - doneCount - failedCount} 待处理
            </div>
          </div>
        )}

        <textarea
          value={rawScript}
          onChange={e => setRawScript(e.target.value)}
          rows={4}
          placeholder={'# 标题\n总时长：35s\n\n| 时间（开始 - 结束 \\| 时长） & 镜头描述 | 口播文案 | 镜头构成 |\n|---|---|---|\n| 0:00 - 0:03 \\| 3s - 演员刚做完... | 每次... | 景别：中景 / ... |'}
          style={scriptTextareaStyle}
        />
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          {parsingScript && <span style={{ fontSize: 12, color: '#0d7a5f' }}>🤖 AI 拆分镜 + 估时长 + 润色中...</span>}
          <button onClick={handleParseScript} disabled={batchRunning || parsingScript} style={{ ...btnPrimary, padding: '10px 24px', opacity: (batchRunning || parsingScript) ? 0.6 : 1 }}>
            {parsingScript ? '🤖 解析中...' : '🔍 解析脚本（AI）'}
          </button>
        </div>
      </div>

      {/* ===== 卡片 3：分镜列表 + 批量操作 ===== */}
      {shots.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>🎬 分镜列表</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={handleOptimizeAll}
                disabled={shots.length === 0 || optimizingShotIds.size > 0 || batchRunning}
                style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12, opacity: (shots.length === 0 || optimizingShotIds.size > 0 || batchRunning) ? 0.5 : 1 }}
                title="调用 LLM 一次性优化所有分镜的提示词（保留台词、增强画面感）"
              >
                {optimizingShotIds.size > 0 ? `优化中 ${optimizingShotIds.size}/${shots.length}...` : '✨ 优化全部提示词'}
              </button>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>分辨率</div>
              <select value={resolution} onChange={e => setResolution(e.target.value)} style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}>
                {RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>比例</div>
              <select value={ratio} onChange={e => setRatio(e.target.value)} style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}>
                {RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {shots.map(shot => (
            <div key={shot.id} style={{ ...shotCardStyle, borderLeftColor: shotBorderColor(shot.status) }}>
              <div style={shotHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#005d50' }}>#{shot.index}</span>
                  <span style={{ fontSize: 13, color: '#142528' }}>
                    {shot.start && shot.end ? `${shot.start} - ${shot.end}` : `分镜 #${shot.index}`}
                  </span>
                  <span
                    style={{ fontSize: 12, color: '#142528', padding: '2px 10px', background: '#eef7f5', borderRadius: 10, fontWeight: 600 }}
                    title="基于动作+台词+留白估算，点 ✨ 优化 会重新估"
                  >
                    {shot.duration}s
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={shotStatusBadgeStyle(shot.status)}>
                    {shot.status === 'pending' && '⏸ 待生成'}
                    {shot.status === 'generating' && '⚙️ 生成中'}
                    {shot.status === 'done' && '✅ 完成'}
                    {shot.status === 'failed' && '❌ 失败'}
                    {shot.status === 'cancelled' && '⏹ 已取消'}
                  </span>
                  <button
                    onClick={() => handleGenerateShot(shot.id)}
                    disabled={shot.status === 'generating' || batchRunning}
                    style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12, opacity: (shot.status === 'generating' || batchRunning) ? 0.5 : 1 }}
                  >
                    单独生成
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ ...labelStyle, fontSize: 12, margin: 0 }}>提示词</div>
                  <button
                    onClick={() => handleOptimizeShot(shot.id)}
                    disabled={optimizingShotIds.has(shot.id) || batchRunning}
                    style={{ ...btnSecondary, padding: '2px 10px', fontSize: 11, opacity: (optimizingShotIds.has(shot.id) || batchRunning) ? 0.5 : 1 }}
                  >
                    {optimizingShotIds.has(shot.id) ? '优化中...' : '✨ 优化'}
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={shot.prompt}
                  onChange={e => updateShot(shot.id, { prompt: e.target.value })}
                  placeholder="镜头画面描述"
                  style={{ ...textareaStyle, fontSize: 13 }}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ ...labelStyle, fontSize: 12 }}>口播台词（已自动拼入提示词）</div>
                <textarea
                  rows={1}
                  value={shot.voiceover}
                  onChange={e => updateShot(shot.id, { voiceover: e.target.value })}
                  placeholder="本镜头的台词"
                  style={{ ...textareaStyle, fontSize: 13, background: '#fafafa', color: '#555' }}
                />
              </div>

              {shot.error && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fde2e2', color: '#b42318', borderRadius: 6, fontSize: 12 }}>
                  错误：{shot.error}
                </div>
              )}

              {shot.status === 'done' && shot.videoUrl && (
                <div style={{ marginTop: 10, padding: 12, background: '#f5fbfa', border: '1px solid #dce9e7', borderRadius: 8 }}>
                  <video src={shot.videoUrl} controls style={{ width: '100%', maxHeight: 280, borderRadius: 8, background: '#000' }} />
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <a href={shot.videoUrl} download target="_blank" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block', padding: '6px 14px', fontSize: 12 }}>
                      ⬇️ 下载本段视频
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 批量操作 */}
          <div style={{ marginTop: 16, padding: 16, background: '#fafafa', borderRadius: 10, border: '1px solid #eaeaea' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#142528', fontWeight: 600 }}>
                批量生成进度：{doneCount} / {shots.length} 镜头完成
                {failedCount > 0 && <span style={{ color: '#c53030', marginLeft: 8 }}>（{failedCount} 个失败）</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {batchRunning ? (
                  <button onClick={handleCancelBatch} style={{ ...btnSecondary, borderColor: '#c53030', color: '#c53030', padding: '8px 16px' }}>
                    ⏹ 取消
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAll}
                    disabled={shots.length === 0 || images.length === 0}
                    style={{ ...btnPrimary, padding: '8px 20px' }}
                  >
                    🚀 一键生成全部
                  </button>
                )}
              </div>
            </div>
            <div style={progressBarContainerStyle}>
              <div style={progressBarFillStyle(progressRatio)} />
            </div>
            {shots.length > 0 && doneCount === shots.length && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#0d7a5f', fontWeight: 600 }}>
                🎉 全部镜头已生成完成！每段视频可以在上方卡片里单独预览和下载。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
