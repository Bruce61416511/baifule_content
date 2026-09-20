// 全局消息提示工具（替代 antd message）
export function showMessage(type, text) {
  const div = document.createElement('div')
  const colors = { error: '#c53030', success: '#17857e', warning: '#e6a817', info: '#005d50' }
  div.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);background:${colors[type] || colors.info};transition:opacity 0.3s;`
  div.textContent = text
  document.body.appendChild(div)
  setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300) }, 3000)
}

// 通用输入样式
export const inputStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #d9d9d9',
  fontSize: 14,
  outline: 'none',
}

export const textareaStyle = {
  ...inputStyle,
  width: '100%',
  resize: 'vertical',
  fontFamily: 'inherit',
}

export const btnPrimary = {
  padding: '10px 24px',
  borderRadius: 8,
  border: 'none',
  background: '#005d50',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  boxShadow: '0 4px 12px rgba(0, 93, 80, 0.3)',
}

export const btnSecondary = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #005d50',
  background: '#fff',
  color: '#005d50',
  cursor: 'pointer',
  fontSize: 14,
}

export const labelStyle = {
  fontSize: 13,
  color: '#8c8c8c',
  marginBottom: 4,
}

export const cardStyle = {
  padding: 20,
  border: '1px solid #e2eeea',
  borderRadius: 14,
  marginBottom: 20,
  background: '#fff',
}

// ========== 抽屉式大编辑区（模态框）==========

export const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20, 37, 40, 0.55)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 24,
}

export const modalBoxStyle = {
  background: '#fff',
  borderRadius: 16,
  width: '100%',
  maxWidth: 780,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.25)',
  overflow: 'hidden',
}

export const modalHeaderStyle = {
  padding: '18px 24px',
  borderBottom: '1px solid #e2eeea',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'linear-gradient(180deg, #fafffe 0%, #fff 100%)',
}

export const modalTitleStyle = {
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  color: '#142528',
}

export const modalBodyStyle = {
  padding: '20px 24px',
  overflowY: 'auto',
  flex: 1,
}

export const modalFooterStyle = {
  padding: '14px 24px',
  borderTop: '1px solid #e2eeea',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: '#fafdfc',
}

// 大编辑区用的 textarea：行高更大、字号稍大、padding 更宽
export const bigTextareaStyle = {
  width: '100%',
  minHeight: 320,
  padding: 16,
  borderRadius: 10,
  border: '1px solid #dce9e7',
  fontSize: 15,
  lineHeight: 1.75,
  fontFamily: 'inherit',
  color: '#142528',
  background: '#fafdfc',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
}

// 紧凑预览用的 textarea：只读、灰色、带占位提示
export const previewTextareaStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e2eeea',
  fontSize: 13,
  lineHeight: 1.6,
  fontFamily: 'inherit',
  color: '#142528',
  background: '#fafdfc',
  resize: 'none',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'text',
}

// ========== 分镜卡片样式 ==========

// 单个分镜卡片容器：左边框用彩色标记状态
export const shotCardStyle = {
  padding: 16,
  borderRadius: 10,
  border: '1px solid #e2eeea',
  borderLeft: '4px solid #d9d9d9',
  background: '#ffffff',
  marginBottom: 12,
}

// 分镜头部：时间区间 + 状态徽章
export const shotHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
  paddingBottom: 10,
  borderBottom: '1px dashed #eaeaea',
}

// 根据 status 返回状态徽章样式
export function shotStatusBadgeStyle(status) {
  const base = {
    padding: '3px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }
  switch (status) {
    case 'generating':
      return { ...base, background: '#fff3cd', color: '#995700' }
    case 'done':
      return { ...base, background: '#d1f5ed', color: '#0d7a5f' }
    case 'failed':
      return { ...base, background: '#fde2e2', color: '#b42318' }
    case 'cancelled':
      return { ...base, background: '#f0f0f0', color: '#666' }
    default: // pending
      return { ...base, background: '#f5f5f5', color: '#8c8c8c' }
  }
}

// 根据 status 返回 shot 卡片左边框颜色
export function shotBorderColor(status) {
  switch (status) {
    case 'generating': return '#e6a817'
    case 'done': return '#17857e'
    case 'failed': return '#c53030'
    case 'cancelled': return '#d9d9d9'
    default: return '#d9d9d9'
  }
}

// 批量进度条
export const progressBarContainerStyle = {
  width: '100%',
  height: 8,
  background: '#eef2f1',
  borderRadius: 4,
  overflow: 'hidden',
  marginTop: 8,
}

export function progressBarFillStyle(ratio) {
  return {
    width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
    height: '100%',
    background: 'linear-gradient(90deg, #005d50 0%, #17857e 100%)',
    transition: 'width 0.3s ease',
  }
}

// 脚本输入区 textarea：紧凑，因为原始脚本解析完就不再关注
export const scriptTextareaStyle = {
  width: '100%',
  minHeight: 120,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d9d9d9',
  fontSize: 12,
  lineHeight: 1.55,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  color: '#142528',
  background: '#fafdfc',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
  whiteSpace: 'pre',
  overflowX: 'auto',
}
