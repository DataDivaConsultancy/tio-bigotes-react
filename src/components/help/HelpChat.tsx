import { useState, useRef, useEffect } from 'react'
import { HelpCircle, X, Send, Trash2, Sparkles } from 'lucide-react'
import { findAnswer, EJEMPLOS } from './faq'

interface Mensaje {
  id: string
  rol: 'user' | 'bot'
  texto: string
  ts: number
}

const STORAGE_KEY = 'tb_help_chat_msgs'

const SALUDO: Mensaje = {
  id: 'saludo',
  rol: 'bot',
  texto:
`¡Hola! 👋 Soy el asistente de ayuda de Tío Bigotes / Sebbro Foods.

Puedes preguntarme cosas como:
• ¿Cómo cargo ventas?
• ¿Cómo veo el BI?
• ¿Cómo creo un empleado?
• ¿Qué hago si me da error?

Escribe tu pregunta abajo o pulsa uno de los ejemplos.`,
  ts: Date.now(),
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function HelpChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // ignorar
    }
    return [SALUDO]
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Persistencia simple en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mensajes))
    } catch {
      // ignorar (modo privado, etc.)
    }
  }, [mensajes])

  // Autoscroll al fondo cuando hay mensaje nuevo o se abre el panel
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [mensajes, open])

  function responder(pregunta: string) {
    const limpia = pregunta.trim()
    if (!limpia) return

    const userMsg: Mensaje = { id: nowId(), rol: 'user', texto: limpia, ts: Date.now() }

    const match = findAnswer(limpia)
    const respuesta = match
      ? match.respuesta
      : `No estoy seguro de cómo responder a esa pregunta todavía 🤔

Prueba a reformularla, o usa una de estas:
${EJEMPLOS.map((e) => `• ${e}`).join('\n')}

Si el problema persiste, avisa al administrador o usa la auditoría para ver qué pasó.`

    const botMsg: Mensaje = { id: nowId(), rol: 'bot', texto: respuesta, ts: Date.now() + 1 }

    setMensajes((m) => [...m, userMsg, botMsg])
    setInput('')
  }

  function limpiar() {
    setMensajes([SALUDO])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    responder(input)
  }

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[55] w-14 h-14 rounded-full bg-[hsl(var(--sidebar-active))] text-white shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
          aria-label="Abrir ayuda"
          title="Abrir asistente de ayuda"
        >
          <HelpCircle size={24} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-[55] w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-2rem))] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Asistente de ayuda"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[hsl(var(--sidebar-active))] text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm leading-tight">Ayuda Tío Bigotes</p>
              <p className="text-xs text-white/80">Asistente para empleados</p>
            </div>
            <button
              onClick={limpiar}
              className="p-1.5 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
              title="Limpiar conversación"
              aria-label="Limpiar conversación"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
              title="Cerrar"
              aria-label="Cerrar ayuda"
            >
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-background">
            {mensajes.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line
                    ${m.rol === 'user'
                      ? 'bg-[hsl(var(--sidebar-active))] text-white rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'}
                  `}
                >
                  {m.texto}
                </div>
              </div>
            ))}
          </div>

          {/* Ejemplos rápidos */}
          {mensajes.length <= 1 && (
            <div className="px-3 py-2 border-t flex flex-wrap gap-1.5 shrink-0 bg-card">
              {EJEMPLOS.slice(0, 4).map((ej) => (
                <button
                  key={ej}
                  onClick={() => responder(ej)}
                  className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-muted transition-colors text-foreground"
                >
                  {ej}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t p-2 flex gap-2 bg-card shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--sidebar-active))]"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-3 py-2 rounded-lg bg-[hsl(var(--sidebar-active))] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center gap-1 text-sm"
              aria-label="Enviar"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
