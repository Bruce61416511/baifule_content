import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './index.css'

// 全局错误捕获
window.addEventListener('error', (e) => {
  console.error('Global error:', e.message, e.filename, e.lineno)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

const brandTheme = {
  token: {
    colorPrimary: '#005d50',
    colorLink: '#005d50',
    colorSuccess: '#17857e',
    colorWarning: '#e6a817',
    colorError: '#c53030',
    borderRadius: 10,
    fontFamily: "'Inter', system-ui, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif",
  },
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ConfigProvider theme={brandTheme} locale={zhCN}>
        <AntApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </React.StrictMode>,
  )
} catch (err) {
  console.error('Render error:', err)
  document.getElementById('root').innerHTML = `<div style="color:red;padding:20px;font-family:monospace">Error: ${err.message}</div>`
}
