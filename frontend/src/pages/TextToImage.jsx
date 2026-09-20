import { useState, useRef } from 'react'
import { generationApi, optimizeApi } from '../services/api'

const SIZE_OPTIONS = [
  { label: '1024 × 1024 (方形)', value: '1024*1024' },
  { label: '720 × 1280 (竖版)', value: '720*1280' },
  { label: '1280 × 720 (横版)', value: '1280*720' },
  { label: '512 × 512', value: '512*512' },
]

const STYLE_OPTIONS = [
  { label: '摄影', value: '<photography>' },
  { label: '动漫', value: '<anime>' },
  { label: '油画', value: '<oil painting>' },
  { label: '水彩', value: '<watercolor>' },
  { label: '素描', value: '<sketch>' },
  { label: '3D渲染', value: '<3d render>' },
  { label: '自动', value: '<auto>' },
]

export default function TextToImage() {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024*1024')
  const [n, setN] = useState(4)
  const [style, setStyle] = useState('<photography>')
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [images, setImages] = useState([])
  const pollRef = useRef(null)

  const showMessage = (type, text) => {
    const div = document.createElement('div')
    div.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);`
    div.style.background = type === 'error' ? '#c53030' : type === 'success' ? '#17857e' : '#005d50'
    div.textContent = text
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 3000)
  }

  const pollTask = async (taskId) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await generationApi.taskStatus(taskId)
        if (data.status === 'SUCCEEDED') {
          clearInterval(pollRef.current)
          setLoading(false)
          const results = data.output?.results || []
          setImages(results.map(r => r.url || r.b64_image))
          showMessage('success', `生成完成，共 ${results.length} 张图片`)
        } else if (data.status === 'FAILED') {
          clearInterval(pollRef.current)
          setLoading(false)
          showMessage('error', '生成失败: ' + (data.output?.message || '未知错误'))
        }
      } catch (e) {
        clearInterval(pollRef.current)
        setLoading(false)
        showMessage('error', '查询状态失败: ' + e.message)
      }
    }, 3000)
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return showMessage('warning', '请输入提示词')
    setLoading(true)
    setImages([])
    try {
      const res = await generationApi.t2i({ prompt, size, n, style })
      showMessage('info', '任务已提交，正在生成...')
      pollTask(res.task_id)
    } catch (e) {
      setLoading(false)
      showMessage('error', e.message)
    }
  }

  const handleOptimize = async () => {
    if (!prompt.trim()) return showMessage('warning', '请先输入提示词')
    setOptimizing(true)
    try {
      const res = await optimizeApi.optimize(prompt, 't2i')
      setPrompt(res.optimized_prompt)
      showMessage('success', '提示词已优化')
    } catch (e) {
      showMessage('error', '优化失败: ' + e.message)
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#142528' }}>文生图片</h2>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>使用 wan2.6-t2i 模型，文字描述生成高质量图片</span>
      </div>

      <div style={{ padding: 20, border: '1px solid #e2eeea', borderRadius: 14, marginBottom: 20, background: '#fff' }}>
        <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>提示词</div>
        <textarea
          rows={4}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="描述你想生成的图片，例如：一个女孩在海边奔跑，夕阳，慢动作"
          style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', fontSize: 14, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={handleOptimize}
            disabled={optimizing}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #005d50', background: optimizing ? '#f0f0f0' : '#fff', color: '#005d50', cursor: 'pointer', fontSize: 14 }}
          >
            {optimizing ? '优化中...' : '✨ 一键优化提示词'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>分辨率</div>
            <select value={size} onChange={e => setSize(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14 }}>
              {SIZE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>生成数量</div>
            <input type="number" min={1} max={4} value={n} onChange={e => setN(Number(e.target.value))} style={{ width: 80, padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14 }} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>风格</div>
            <select value={style} onChange={e => setStyle(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 14 }}>
              {STYLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: loading ? '#ccc' : '#005d50', color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600, boxShadow: '0 4px 12px rgba(0, 93, 80, 0.3)' }}
          >
            {loading ? '生成中...' : '生成图片'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, border: '1px solid #e2eeea', borderRadius: 14, background: '#fafafa' }}>
          <div style={{ fontSize: 16, color: '#005d50' }}>⏳ 正在生成图片，请耐心等待...</div>
        </div>
      )}

      {images.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>生成结果 ({images.length} 张)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {images.map((url, i) => (
              <div key={i} style={{ border: '1px solid #e2eeea', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <img src={url} alt={`图片 ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: 12, textAlign: 'center' }}>
                  <a href={url} download target="_blank" style={{ color: '#005d50', textDecoration: 'none', fontSize: 13 }}>下载</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
