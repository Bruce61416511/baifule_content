import { useState, useEffect } from 'react'
import { configApi } from '../services/api'
import { showMessage, inputStyle, textareaStyle, btnPrimary, btnSecondary, labelStyle, cardStyle } from '../services/ui'
import { VOICE_PRESETS } from '../services/constants'

const MODEL_KEYS = ['t2i', 't2v', 'i2v', 'r2v']
const VOICE_MODELS = ['cosyvoice-v2', 'cosyvoice-v1']
const FORMAT_OPTIONS = ['mp3', 'wav', 'pcm']

// 只读字段包装：非编辑态显示为灰色锁定样式
function FormField({ editing, children, style }) {
  return (
    <div style={{
      opacity: editing ? 1 : 0.75,
      pointerEvents: editing ? 'auto' : 'none',
      ...(editing ? {} : { background: '#f5f5f5', borderRadius: 6, padding: '2px 6px', border: '1px solid #ebebeb' }),
      ...style,
    }}>{children}</div>
  )
}

export default function ModelConfig() {
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    configApi.getModels()
      .then(raw => {
        // 自动修正：如果 voice 配置里用的是 v2 模型或 v2 里不可用的音色，自动回落到 v1+longshu
        const fixed = { ...raw }
        if (fixed.voice) {
          const v = { ...fixed.voice }
          let changed = false
          if (v.model_id === 'cosyvoice-v2') {
            v.model_id = 'cosyvoice-v1'
            changed = true
          }
          if (v.defaults && v.defaults.voice === 'longxiaochun') {
            v.defaults = { ...v.defaults, voice: 'longshu' }
            changed = true
          }
          if (changed) {
            fixed.voice = v
            // 顺手把修正后的配置回写后端，避免下次还得再修
            configApi.updateModels(fixed).catch(() => {})
          }
        }
        setCfg(fixed)
      })
      .catch(e => showMessage('error', '加载失败: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...cardStyle, textAlign: 'center', color: '#8c8c8c' }}>加载中...</div>
  if (!cfg) return <div style={cardStyle}>加载失败，请检查后端服务</div>

  const upd = (path, val) => {
    const next = { ...cfg }
    let cur = next
    const keys = path.split('.')
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] = { ...cur[keys[i]] }
    cur[keys[keys.length - 1]] = val
    setCfg(next)
  }

  const updDefault = (modelKey, field, val) => {
    const next = { ...cfg, models: { ...cfg.models, [modelKey]: { ...cfg.models[modelKey], defaults: { ...cfg.models[modelKey].defaults, [field]: val } } } }
    setCfg(next)
  }

  const handleSave = async () => {
    setSaving(true)
    try { await configApi.updateModels(cfg); showMessage('success', '模型配置已保存'); setEditing(false) }
    catch (e) { showMessage('error', '保存失败: ' + e.message) } finally { setSaving(false) }
  }

  const handleCancel = () => {
    // 重新加载配置，丢弃未保存的修改
    setLoading(true)
    configApi.getModels().then(setCfg).catch(e => showMessage('error', '重新加载失败')).finally(() => { setLoading(false); setEditing(false) })
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#142528' }}>
            模型配置
            {editing && <span style={{ fontSize: 12, color: '#e6a817', fontWeight: 600, marginLeft: 12, padding: '3px 10px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4 }}>⚠️ 编辑中</span>}
            {!editing && !loading && <span style={{ fontSize: 12, color: '#17857e', fontWeight: 600, marginLeft: 12, padding: '3px 10px', background: '#f0fbf9', border: '1px solid #c7eae6', borderRadius: 4 }}>🔒 已锁定</span>}
          </h2>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>配置 API 密钥和模型参数{!editing && '（点击右上角"编辑"进入修改模式）'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={btnSecondary}>✏️ 编辑</button>
          ) : (
            <>
              <button onClick={handleCancel} style={{ ...btnSecondary, borderColor: '#8c8c8c', color: '#8c8c8c' }}>取消</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? '保存中...' : '💾 保存'}</button>
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, color: '#142528' }}>🔑 API 密钥</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <FormField editing={editing}><div style={labelStyle}>DashScope API Key（视频生成）</div><input type="password" value={cfg.api_key} onChange={e => upd('api_key', e.target.value)} placeholder="sk-..." style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
          <FormField editing={editing}><div style={labelStyle}>LLM API Key（提示词优化，可留空使用同 Key）</div><input type="password" value={cfg.llm_api_key} onChange={e => upd('llm_api_key', e.target.value)} placeholder="sk-..." style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
          <FormField editing={editing}><div style={labelStyle}>LLM Base URL</div><input value={cfg.llm_base_url} onChange={e => upd('llm_base_url', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
          <FormField editing={editing}><div style={labelStyle}>LLM 模型名称</div><input value={cfg.llm_model} onChange={e => upd('llm_model', e.target.value)} placeholder="qwen-plus" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
        </div>
      </div>

      {MODEL_KEYS.map(key => {
        const m = cfg.models[key]
        if (!m) return null
        return (
          <div key={key} style={cardStyle}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, color: '#142528' }}>📦 {m.label}（{key}）<span style={{ color: '#8c8c8c', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>{m.description}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 12 }}>
              <FormField editing={editing}><div style={labelStyle}>Model ID</div><input value={m.model_id} onChange={e => setCfg({ ...cfg, models: { ...cfg.models, [key]: { ...m, model_id: e.target.value } } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
              {m.defaults.size && <FormField editing={editing}><div style={labelStyle}>默认尺寸</div><input value={m.defaults.size} onChange={e => updDefault(key, 'size', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>}
              {m.defaults.n !== undefined && <FormField editing={editing}><div style={labelStyle}>默认生成数量</div><input type="number" value={m.defaults.n} onChange={e => updDefault(key, 'n', Number(e.target.value))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>}
              {m.defaults.style !== undefined && <FormField editing={editing}><div style={labelStyle}>默认风格</div><input value={m.defaults.style} onChange={e => updDefault(key, 'style', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>}
              {m.defaults.resolution && <FormField editing={editing}><div style={labelStyle}>默认分辨率</div><select value={m.defaults.resolution} onChange={e => updDefault(key, 'resolution', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>{['480P', '720P', '1080P'].map(v => <option key={v} value={v}>{v}</option>)}</select></FormField>}
              {m.defaults.ratio && <FormField editing={editing}><div style={labelStyle}>默认画面比例</div><select value={m.defaults.ratio} onChange={e => updDefault(key, 'ratio', e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>{['16:9', '9:16', '1:1'].map(v => <option key={v} value={v}>{v}</option>)}</select></FormField>}
              {m.defaults.duration !== undefined && <FormField editing={editing}><div style={labelStyle}>默认视频时长(秒)</div><input type="number" value={m.defaults.duration} onChange={e => updDefault(key, 'duration', Number(e.target.value))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>}
              {m.defaults.prompt_extend !== undefined && <FormField editing={editing} style={{ display: 'flex', alignItems: 'flex-end' }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: editing ? 'pointer' : 'not-allowed', padding: '8px 0' }}><input type="checkbox" checked={m.defaults.prompt_extend} onChange={e => updDefault(key, 'prompt_extend', e.target.checked)} disabled={!editing} /><span style={{ fontSize: 13 }}>默认开启智能提示词扩展</span></label></FormField>}
            </div>
          </div>
        )
      })}

      {cfg.voice && (
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #fff 0%, #fafffe 100%)' }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: '#142528' }}>🎙️ {cfg.voice.label}<span style={{ color: '#8c8c8c', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>{cfg.voice.description}</span></div>
          <div style={{ fontSize: 12, color: '#e6a817', marginBottom: 16, padding: '6px 10px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, display: 'inline-block' }}>
            ⚠️ 语音合成使用 DashScope CosyVoice API，与视频生成共用同一个 API Key
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <FormField editing={editing}><div style={labelStyle}>Model ID</div><select value={cfg.voice.model_id} onChange={e => setCfg({ ...cfg, voice: { ...cfg.voice, model_id: e.target.value } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>{VOICE_MODELS.map(v => <option key={v} value={v}>{v}</option>)}</select></FormField>
            <FormField editing={editing}><div style={labelStyle}>默认音色（预设发音人）</div><select value={cfg.voice.defaults.voice} onChange={e => setCfg({ ...cfg, voice: { ...cfg.voice, defaults: { ...cfg.voice.defaults, voice: e.target.value } } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>{VOICE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></FormField>
            <FormField editing={editing}><div style={labelStyle}>输出格式</div><select value={cfg.voice.defaults.format} onChange={e => setCfg({ ...cfg, voice: { ...cfg.voice, defaults: { ...cfg.voice.defaults, format: e.target.value } } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>{FORMAT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}</select></FormField>
            <FormField editing={editing}><div style={labelStyle}>采样率 (Hz)</div><select value={cfg.voice.defaults.sample_rate} onChange={e => setCfg({ ...cfg, voice: { ...cfg.voice, defaults: { ...cfg.voice.defaults, sample_rate: Number(e.target.value) } } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>{[16000, 22050, 24000, 44100, 48000].map(r => <option key={r} value={r}>{r}</option>)}</select></FormField>
            <FormField editing={editing}><div style={labelStyle}>音量 (0~100)</div><input type="number" min={0} max={100} value={cfg.voice.defaults.volume} onChange={e => setCfg({ ...cfg, voice: { ...cfg.voice, defaults: { ...cfg.voice.defaults, volume: Number(e.target.value) } } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
            <FormField editing={editing}><div style={labelStyle}>语速 (0.5~2.0)</div><input type="number" step={0.1} min={0.5} max={2} value={cfg.voice.defaults.rate} onChange={e => setCfg({ ...cfg, voice: { ...cfg.voice, defaults: { ...cfg.voice.defaults, rate: Number(e.target.value) } } })} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} /></FormField>
          </div>
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafffe', border: '1px dashed #dce9e7', borderRadius: 8, fontSize: 13, color: '#005d50' }}>
            💡 <strong>使用场景：</strong>输入一段台词文字 + 上传 3~10 秒参考音频样本 → CosyVoice 生成同音色的配音文件 → 将该音频喂给 wan2.7-r2v 作为 <code>reference_voice</code>，让视频角色"开口说你的台词"。如果只用预设音色，无需上传参考音频。
          </div>
        </div>
      )}
    </div>
  )
}
