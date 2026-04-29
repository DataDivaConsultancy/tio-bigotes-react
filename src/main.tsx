import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Registrar Service Worker (PWA) — vite-plugin-pwa lo expone via virtual:pwa-register
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegistered(r) {
        if (r) {
          // Comprobar actualizaciones cada hora
          setInterval(() => { r.update().catch(() => {}) }, 60 * 60 * 1000)
        }
      },
      onOfflineReady() {
        console.log('[PWA] App lista para uso offline')
      },
    })
  }).catch((e) => console.warn('[PWA] No se pudo registrar el SW:', e))
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
