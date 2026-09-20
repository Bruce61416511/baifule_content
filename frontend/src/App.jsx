import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import TextToImage from './pages/TextToImage'
import TextToVideo from './pages/TextToVideo'
import FrameVideo from './pages/FrameVideo'
import RefVideo from './pages/RefVideo'
import ModelConfig from './pages/ModelConfig'
import PromptConfig from './pages/PromptConfig'

const menuItems = [
  { key: '/text-to-image', label: '文生图片' },
  { key: '/text-to-video', label: '文生视频' },
  { key: '/frame-video', label: '首尾视频' },
  { key: '/ref-video', label: '参考视频' },
  { key: '/model-config', label: '模型配置' },
  { key: '/prompt-config', label: '文件配置' },
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ width: 200, background: '#00473f', color: '#fff', padding: 20 }}>
        <h2 style={{ fontSize: 18, marginBottom: 20 }}>万相创作</h2>
        <nav>
          {menuItems.map(item => (
            <div
              key={item.key}
              onClick={() => navigate(item.key)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderRadius: 6,
                marginBottom: 4,
                background: location.pathname === item.key ? 'rgba(255,255,255,0.15)' : 'transparent',
              }}
            >
              {item.label}
            </div>
          ))}
        </nav>
      </div>
      <div style={{ flex: 1, padding: 28, background: '#f5f7f6' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, minHeight: 'calc(100vh - 56px)' }}>
          <Routes>
            <Route path="/" element={<TextToImage />} />
            <Route path="/text-to-image" element={<TextToImage />} />
            <Route path="/text-to-video" element={<TextToVideo />} />
            <Route path="/frame-video" element={<FrameVideo />} />
            <Route path="/ref-video" element={<RefVideo />} />
            <Route path="/model-config" element={<ModelConfig />} />
            <Route path="/prompt-config" element={<PromptConfig />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
