import { useState, useRef } from 'react'
import { generationApi, optimizeApi } from '../services/api'
import { showMessage, textareaStyle, inputStyle, btnPrimary, btnSecondary, labelStyle, cardStyle } from '../services/ui'

const RESOLUTION_OPTIONS = [{ label: '480P', value: '480P' }, { label: '720P', value: '720P' }, { label: '1080P', value: '1080P' }]
const RATIO_OPTIONS = [{ label: '16:9 (横版)', value: '16:9' }, { label: '9:16 (竖版)', value: '9:16' }, { label: '1:1 (方形)', value: '1:1' }]
const DURATION_OPTIONS = [{ label: '2秒', value: 2 }, { label: '3秒', value: 3 }, { label: '5秒', value: 5 }, { label: '8秒', value: 8 }, { label: '10秒', value: 10 }, { label: '15秒', value: 15 }]

export default function FrameVideo() {
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState('720P')
  const [ratio, setRatio] = useState('16:9')
  const [duration, setDuration] = useState(5)
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [firstFrame, setFirstFrame] = useState(null)
  const [lastFrame, setLastFrame] = useState(null)
  const pollRef = useRef(null)

  const handleFileUpload = async (file, setFrame) => {
    try {
      const res = await generationApi.upload(file)
      setFrame({ url: res.url, preview: URL.createObjectURL(file), name: file.name })
      showMessage('success', '上传成功')
    } catch (e) { showMessage('error', '上传失败: ' + e.message) }
  }

  const pollTask = async (taskId) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await generationApi.taskStatus(taskId)
        if (data.status === 'SUCCEEDED') { clearInterval(pollRef.current); setLoading(false); setVideoUrl(data.output?.video_url || ''); showMessage('success', '视频生成完成！') }
        else if (data.status === 'FAILED') { clearInterval(pollRef.current); setLoading(false); showMessage('error', '生成失败') }
      } catch (e) { clearInterval(pollRef.current); setLoading(false) }
    }, 3000)
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return showMessage('warning', '请输入提示词')
    if (!firstFrame) return showMessage('warning', '请上传首帧图片')
    setLoading(true); setVideoUrl('')
    try {
      const res = await generationApi.i2v({ prompt, img_url: firstFrame.url, last_img_url: lastFrame?.url || null, resolution, ratio, duration })
      showMessage('info', '任务已提交，视频生成中...'); pollTask(res.task_id)
    } catch (e) { setLoading(false); showMessage('error', e.message) }
  }

  const handleOptimize = async () => {
    if (!prompt.trim()) return showMessage('warning', '请先输入提示词')
    setOptimizing(true)
    try { const res = await optimizeApi.optimize(prompt, 'i2v'); setPrompt(res.optimized_prompt); showMessage('success', '提示词已优化') }
    catch (e) { showMessage('error', '优化失败') } finally { setOptimizing(false) }
  }

  const renderUploadBox = (frame, setFrame, label, required) => (
    <div style={{ flex: 1, minWidth: 200, border: '1px dashed #dce9e7', borderRadius: 12, padding: 16, textAlign: 'center', background: frame ? '#fafffe' : '#fafafa' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#142528', marginBottom: 8 }}>{label} {required && <span style={{ color: '#c53030' }}>*</span>}</div>
      {frame ? (
        <div>
          <img src={frame.preview} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'contain' }} />
          <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>{frame.name}</div>
          <button onClick={() => setFrame(null)} style={{ marginTop: 8, padding: '4px 12px', borderRadius: 6, border: '1px solid #c53030', background: '#fff', color: '#c53030', cursor: 'pointer', fontSize: 12 }}>移除</button>
        </div>
      ) : (
        <label style={{ padding: '20px 0', cursor: 'pointer', display: 'block' }}>
          <div style={{ fontSize: 32, color: '#005d50' }}>📷</div>
          <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 13 }}>点击上传图片</div>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0], setFrame)} />
        </label>
      )}
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#142528' }}>首尾视频</h2>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>使用 wan2.7-i2v 模型，首帧+尾帧图片生成过渡视频</span>
      </div>
      <div style={cardStyle}>
        <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>提示词</div>
        <textarea rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述首帧到尾帧的过渡动画" style={{ ...textareaStyle, marginBottom: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={handleOptimize} disabled={optimizing} style={btnSecondary}>{optimizing ? '优化中...' : '✨ 一键优化提示词'}</button>
        </div>
        <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 14 }}>图片上传</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {renderUploadBox(firstFrame, setFirstFrame, '首帧图片', true)}
          {renderUploadBox(lastFrame, setLastFrame, '尾帧图片 (选填)')}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div style={labelStyle}>分辨率</div><select value={resolution} onChange={e => setResolution(e.target.value)} style={inputStyle}>{RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div><div style={labelStyle}>画面比例</div><select value={ratio} onChange={e => setRatio(e.target.value)} style={inputStyle}>{RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div><div style={labelStyle}>视频时长</div><select value={duration} onChange={e => setDuration(Number(e.target.value))} style={inputStyle}>{DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div style={{ flex: 1 }} />
          <button onClick={handleGenerate} disabled={loading} style={{ ...btnPrimary, padding: '12px 32px', fontSize: 15 }}>{loading ? '生成中...' : '生成视频'}</button>
        </div>
      </div>
      {loading && <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}><div style={{ fontSize: 16, color: '#005d50' }}>⏳ 正在生成视频...</div></div>}
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
