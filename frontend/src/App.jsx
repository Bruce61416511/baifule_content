import { useNavigate, useLocation } from 'react-router-dom'

import TextToImage from './pages/TextToImage'
import TextToVideo from './pages/TextToVideo'
import FrameVideo from './pages/FrameVideo'
import RefVideo from './pages/RefVideo'
import ModelConfig from './pages/ModelConfig'
import PromptConfig from './pages/PromptConfig'

const menuItems = [
  { key: '/text-to-image', label: '文生图片', Page: TextToImage },
  { key: '/text-to-video', label: '文生视频', Page: TextToVideo },
  { key: '/frame-video', label: '首尾视频', Page: FrameVideo },
  { key: '/ref-video', label: '参考视频', Page: RefVideo },
  { key: '/model-config', label: '模型配置', Page: ModelConfig },
  { key: '/prompt-config', label: '文件配置', Page: PromptConfig },
]

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  // 根路径当作"文生图片"处理，保证默认有内容显示
  const activeKey = location.pathname === '/' ? '/text-to-image' : location.pathname

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
                background: activeKey === item.key ? 'rgba(255,255,255,0.15)' : 'transparent',
              }}
            >
              {item.label}
            </div>
          ))}
        </nav>
      </div>
      <div style={{ flex: 1, padding: 28, background: '#f5f7f6' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, minHeight: 'calc(100vh - 56px)' }}>
          {menuItems.map(({ key, Page }) => (
            <div key={key} style={{ display: activeKey === key ? 'block' : 'none' }}>
              <Page />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
