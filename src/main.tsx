import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Boot guard: si la app falló a montarse correctamente (algo en el bundle
// no coincide con los caches del SW), forzar limpieza total y reload.
// Esto evita el caso 'pantalla blanca permanente' por mismatch de versiones.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Detector de mismatch: si dentro de 8s no se montó React, asumimos error
  // y limpiamos todo el cache + SW.
  const bootTimer = setTimeout(async () => {
    const root = document.getElementById('root')
    if (!root || root.children.length === 0) {
      console.warn('[Boot] React no montó a tiempo. Limpiando SW y caches...')
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch (e) { console.error('[Boot] cleanup error', e) }
      window.location.reload()
    }
  }, 8000)
  // Limpiar el timer apenas React monta su árbol
  const observer = new MutationObserver((muts, obs) => {
    const root = document.getElementById('root')
    if (root && root.children.length > 0) {
      clearTimeout(bootTimer)
      obs.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// Registrar Service Worker (PWA)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegistered(r) {
        if (r) {
          // Comprobar actualizaciones cada 5 minutos (antes era cada hora)
          setInterval(() => { r.update().catch(() => {}) }, 5 * 60 * 1000)
        }
      },
      onNeedRefresh() {
        // Hay version nueva — recargar automaticamente
        console.log('[PWA] Nueva version disponible, recargando...')
        window.location.reload()
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
