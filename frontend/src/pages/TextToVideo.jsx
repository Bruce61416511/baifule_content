import { useState, useRef } from 'react'
import { generationApi, optimizeApi } from '../services/api'
import { showMessage, textareaStyle, inputStyle, btnPrimary, btnSecondary, labelStyle, cardStyle } from '../services/ui'

const RESOLUTION_OPTIONS = [
  { label: '480P', value: '480P' }, { label: '720P', value: '720P' }, { label: '1080P', value: '1080P' },
]
const RATIO_OPTIONS = [
  { label: '16:9 (横版)', value: '16:9' }, { label: '9:16 (竖版)', value: '9:16' }, { label: '1:1 (方形)', value: '1:1' },
]
const DURATION_OPTIONS = [
  { label: '2秒', value: 2 }, { label: '3秒', value: 3 }, { label: '5秒', value: 5 },
  { label: '8秒', value: 8 }, { label: '10秒', value: 10 }, { label: '15秒', value: 15 },
]

export default function TextToVideo() {
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState('720P')
  const [ratio, setRatio] = useState('16:9')
  const [duration, setDuration] = useState(5)
  const [promptExtend, setPromptExtend] = useState(true)
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const pollRef = useRef(null)

  const pollTask = async (taskId) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await generationApi.taskStatus(taskId)
        if (data.status === 'SUCCEEDED') {
          clearInterval(pollRef.current); setLoading(false)
          setVideoUrl(data.output?.video_url || ''); showMessage('success', '视频生成完成！')
        } else if (data.status === 'FAILED') {
          clearInterval(pollRef.current); setLoading(false)
          showMessage('error', '生成失败: ' + (data.output?.message || '未知错误'))
        }
      } catch (e) { clearInterval(pollRef.current); setLoading(false); showMessage('error', '查询失败') }
    }, 3000)
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return showMessage('warning', '请输入提示词')
    setLoading(true); setVideoUrl('')
    try {
      const res = await generationApi.t2v({ prompt, resolution, ratio, duration, prompt_extend: promptExtend })
      showMessage('info', '任务已提交，视频生成中...'); pollTask(res.task_id)
    } catch (e) { setLoading(false); showMessage('error', e.message) }
  }

  const handleOptimize = async () => {
    if (!prompt.trim()) return showMessage('warning', '请先输入提示词')
    setOptimizing(true)
    try { const res = await optimizeApi.optimize(prompt, 't2v'); setPrompt(res.optimized_prompt); showMessage('success', '提示词已优化') }
    catch (e) { showMessage('error', '优化失败') } finally { setOptimizing(false) }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#142528' }}>文生视频</h2>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>使用 wan2.7-t2v 模型，纯文字描述生成视频</span>
      </div>
      <div style={cardStyle}>
        <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>提示词</div>
        <textarea rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述你想生成的视频，例如：一只猫从沙发上跳起来，慢动作" style={{ ...textareaStyle, marginBottom: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={handleOptimize} disabled={optimizing} style={btnSecondary}>{optimizing ? '优化中...' : '✨ 一键优化提示词'}</button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div style={labelStyle}>分辨率</div><select value={resolution} onChange={e => setResolution(e.target.value)} style={inputStyle}>{RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div><div style={labelStyle}>画面比例</div><select value={ratio} onChange={e => setRatio(e.target.value)} style={inputStyle}>{RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div><div style={labelStyle}>视频时长</div><select value={duration} onChange={e => setDuration(Number(e.target.value))} style={inputStyle}>{DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div><div style={labelStyle}>智能扩写</div><label style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, cursor: 'pointer' }}><input type="checkbox" checked={promptExtend} onChange={e => setPromptExtend(e.target.checked)} /><span style={{ fontSize: 14 }}>启用</span></label></div>
          <div style={{ flex: 1 }} />
          <button onClick={handleGenerate} disabled={loading} style={{ ...btnPrimary, padding: '12px 32px', fontSize: 15 }}>{loading ? '生成中...' : '生成视频'}</button>
        </div>
      </div>
      {loading && <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}><div style={{ fontSize: 16, color: '#005d50' }}>⏳ 正在生成视频，通常需要 2-5 分钟...</div></div>}
      {videoUrl && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>生成结果</div>
          <div style={{ textAlign: 'center' }}>
            <video src={videoUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 10, background: '#000' }} />
            <div style={{ marginTop: 16 }}><a href={videoUrl} download target="_blank" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>下载视频</a></div>
          </div>
        </div>
      )}
    </div>
  )
}
