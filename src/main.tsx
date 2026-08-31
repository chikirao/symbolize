import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { useEditor } from './store/editorStore'

// Dev-only handles so the engine can be driven and verified from the console
// while working on presets. Stripped from production builds by the bundler.
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>
  w.__editor = useEditor
  void (async () => {
    const [grid, renderer, presets, gradients, random, luminance] = await Promise.all([
      import('./engine/grid'),
      import('./engine/renderer'),
      import('./engine/presets'),
      import('./engine/gradients'),
      import('./engine/random'),
      import('./engine/luminance'),
    ])
    w.__engine = { ...grid, ...renderer, ...presets, ...gradients, ...random, ...luminance }
  })()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
