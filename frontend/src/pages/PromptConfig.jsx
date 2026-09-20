import { useState, useEffect } from 'react'
import { configApi } from '../services/api'
import { showMessage, textareaStyle, btnPrimary, btnSecondary, labelStyle, cardStyle } from '../services/ui'

// 注：prompts.json 里的 r2v（纯文本润色）当前无页面入口，参考视频页只走 parse/optimizeShot 两条链路，故不展示
const PROMPT_KEYS = ['t2i', 't2v', 'i2v', 'r2v_parse', 'r2v_optimize']

export default function PromptConfig() {
  const [prompts, setPrompts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('t2i')

  useEffect(() => {
    configApi.getPrompts().then(setPrompts).catch(e => showMessage('error', '加载失败: ' + e.message)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...cardStyle, textAlign: 'center', color: '#8c8c8c' }}>加载中...</div>
  if (!prompts) return <div style={cardStyle}>加载失败</div>

  const handleSave = async () => {
    setSaving(true)
    try { await configApi.updatePrompts(prompts); showMessage('success', '提示词模板已保存') }
    catch (e) { showMessage('error', '保存失败: ' + e.message) } finally { setSaving(false) }
  }

  const active = prompts[activeTab]

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#142528' }}>文件配置</h2>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>配置各生成模式的系统提示词模板（参考视频含脚本拆分镜、单镜头优化 2 套）</span>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? '保存中...' : '💾 保存配置'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PROMPT_KEYS.map(key => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '10px 20px', borderRadius: 8, border: activeTab === key ? '1px solid #005d50' : '1px solid #dce9e7', background: activeTab === key ? '#005d50' : '#fff', color: activeTab === key ? '#fff' : '#142528', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            {prompts[key]?.label || key}
          </button>
        ))}
      </div>

      {active && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#142528' }}>{active.label}</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>模型类别: {activeTab}</div>
            </div>
          </div>

          <div style={labelStyle}>System Prompt</div>
          <textarea rows={18} value={active.system_prompt} onChange={e => setPrompts({ ...prompts, [activeTab]: { ...active, system_prompt: e.target.value } })} style={{ ...textareaStyle, fontFamily: 'Consolas, Menlo, monospace', fontSize: 13, lineHeight: 1.6 }} />

          <div style={{ marginTop: 12, padding: '12px 16px', background: '#fafffe', border: '1px dashed #dce9e7', borderRadius: 8, fontSize: 13, color: '#005d50' }}>
            💡 该提示词作为 system 消息发送给 LLM，用于优化用户在该模式下输入的原始提示词
          </div>
        </div>
      )}
    </div>
  )
}
