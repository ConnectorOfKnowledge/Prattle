import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FloatingIndicator from './components/FloatingIndicator'
import './index.css'

// Detect if this window is the floating indicator overlay
const isIndicator = new URLSearchParams(window.location.search).get('indicator') === 'true'

// Make the indicator window truly transparent (no white box)
if (isIndicator) {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  document.body.className = '' // Remove any bg classes from index.html
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isIndicator ? <FloatingIndicator /> : <App />}
  </React.StrictMode>
)
