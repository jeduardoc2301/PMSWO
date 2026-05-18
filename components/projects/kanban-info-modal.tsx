'use client'

import { useEffect } from 'react'
import { Info, AlertOctagon, Clock4, Hourglass, ShieldAlert, X, Sparkles } from 'lucide-react'
import { WorkItemPriority } from '@/types'

interface KanbanInfoModalProps {
  onClose: () => void
}

const PRIORITY_BAR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#3b82f6',
}

const PRIORITY_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5', border: 'rgba(239,68,68,0.3)'  },
  HIGH:     { bg: 'rgba(249,115,22,0.12)', color: '#fdba74', border: 'rgba(249,115,22,0.3)' },
  MEDIUM:   { bg: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: 'rgba(245,158,11,0.3)' },
  LOW:      { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: 'rgba(59,130,246,0.3)' },
}

interface SampleCard {
  title: string
  priority: string
  urgency: 'overdue' | 'soon' | 'stale' | 'blocked'
  daysFromDue?: number
  daysStale?: number
  ownerName?: string
}

function MiniKanbanCard({ card }: { card: SampleCard }) {
  const pb = PRIORITY_BADGE[card.priority] ?? PRIORITY_BADGE.MEDIUM
  const bar = PRIORITY_BAR[card.priority] ?? '#3b82f6'

  const urgencyClass = `kc-${card.urgency}`

  const urgencyBadge = (() => {
    if (card.urgency === 'overdue' && card.daysFromDue !== undefined) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(244,63,94,0.12)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.3)' }}>
          <AlertOctagon size={10} /> {Math.abs(card.daysFromDue)}d vencida
        </span>
      )
    }
    if (card.urgency === 'soon' && card.daysFromDue !== undefined) {
      const label = card.daysFromDue === 0 ? 'Hoy' : card.daysFromDue === 1 ? 'Mañana' : `en ${card.daysFromDue}d`
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }}>
          <Clock4 size={10} /> {label}
        </span>
      )
    }
    if (card.urgency === 'stale' && card.daysStale !== undefined) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
          <Hourglass size={10} /> {card.daysStale}d sin mover
        </span>
      )
    }
    if (card.urgency === 'blocked') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(244,63,94,0.12)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.3)' }}>
          <ShieldAlert size={10} />
        </span>
      )
    }
    return null
  })()

  return (
    <div className={`rounded-xl p-3 w-full ${urgencyClass}`}
      style={{ border: '1px solid #27272a', borderLeft: `3px solid ${bar}`, userSelect: 'none' }}>
      <div className="flex items-start gap-1.5 flex-wrap mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: pb.bg, color: pb.color, border: `1px solid ${pb.border}` }}>
          {card.priority}
        </span>
        {urgencyBadge}
      </div>
      <div className="text-sm font-medium text-zinc-100 leading-snug">{card.title}</div>
      {card.ownerName && (
        <div className="text-[11px] text-zinc-500 mt-2">{card.ownerName}</div>
      )}
    </div>
  )
}

function AnatomyRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-3 h-3 rounded-sm mt-1 flex-shrink-0"
        style={{ background: color, boxShadow: `0 0 10px ${color}88` }} />
      <div>
        <div className="text-[12.5px] text-white font-medium">{label}</div>
        <div className="text-[12px] text-zinc-500 leading-relaxed">{desc}</div>
      </div>
    </div>
  )
}

const STATES = [
  {
    id: 'overdue',
    icon: AlertOctagon,
    label: 'Vencida',
    color: '#ef4444',
    rule: 'Su fecha límite ya pasó y no está en "Hecho".',
    detail: 'La tarjeta se tiñe de rojo con un borde brillante, y muestra una píldora "Xd vencida". Es lo primero que ves al abrir el tablero.',
    sample: { title: 'Envío de pre-requisitos', priority: 'HIGH', urgency: 'overdue' as const, daysFromDue: -3 },
  },
  {
    id: 'soon',
    icon: Clock4,
    label: 'Vence pronto',
    color: '#f59e0b',
    rule: 'Vence en las próximas 48 horas (incluyendo hoy).',
    detail: 'Fondo ámbar suave + píldora "Hoy" o "Mañana". Avisa cuando todavía hay tiempo de actuar.',
    sample: { title: 'Colección de data con herramienta', priority: 'MEDIUM', urgency: 'soon' as const, daysFromDue: 0 },
  },
  {
    id: 'stale',
    icon: Hourglass,
    label: 'Estancada',
    color: '#6366f1',
    rule: 'Lleva más de 7 días en la misma columna sin moverse.',
    detail: 'Patrón de líneas diagonales sutiles + píldora indigo "Nd sin mover". No es crítica, pero alguien debería revisarla.',
    sample: { title: 'Documento de gobierno de datos', priority: 'LOW', urgency: 'stale' as const, daysStale: 9 },
  },
  {
    id: 'blocked',
    icon: ShieldAlert,
    label: 'Bloqueada',
    color: '#ef4444',
    rule: 'Tiene al menos un bloqueador abierto asociado.',
    detail: 'Mismo rojo que vencida + ícono de escudo. Suele coexistir con "vencida" — la barra lateral muestra ambos íconos.',
    sample: { title: 'Acompañamiento de instalación', priority: 'CRITICAL', urgency: 'blocked' as const },
  },
]

export function KanbanInfoModal({ onClose }: KanbanInfoModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-8"
      style={{ background: 'rgba(3,3,5,0.72)', backdropFilter: 'blur(10px) saturate(140%)', animation: 'modalFade .18s ease-out' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="overflow-hidden"
        style={{
          width: 'min(1080px, 96vw)', height: 'min(720px, 92vh)',
          background: '#0c0c0f', border: '1px solid #232327', borderRadius: 20,
          boxShadow: '0 30px 80px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.08)',
          display: 'grid', gridTemplateColumns: '320px 1fr',
          animation: 'modalRise .24s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* ─── Aside ─── */}
        <aside
          className="relative overflow-hidden flex flex-col"
          style={{
            background: `
              radial-gradient(120% 80% at 0% 0%, rgba(139,92,246,0.30), transparent 55%),
              radial-gradient(80% 60% at 100% 100%, rgba(99,102,241,0.28), transparent 55%),
              linear-gradient(180deg,#1a1530 0%, #0e0d1a 100%)
            `,
            borderRight: '1px solid #1f1f24',
          }}
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(60% 40% at 50% 0%, rgba(167,139,250,0.20), transparent 70%)' }} />

          <div className="relative h-full p-7 flex flex-col">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#a78bfa,#6366f1)', boxShadow: '0 6px 18px -6px rgba(167,139,250,0.6)' }}>
                <Info size={16} className="text-white" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(196,181,253,0.7)' }}>Guía rápida</div>
                <div className="text-base font-bold text-white">Sistema de urgencia</div>
              </div>
            </div>

            <p className="text-sm leading-relaxed mt-6" style={{ color: 'rgba(255,255,255,0.80)' }}>
              Las tarjetas Kanban comunican <b className="text-white">prioridad</b> e <b className="text-white">importancia</b>, pero no <b className="text-white">urgencia</b>.
              Una tarea HIGH vencida hace 3 días y una HIGH que recién empieza no deberían verse igual.
            </p>

            <p className="text-sm leading-relaxed mt-3" style={{ color: 'rgba(255,255,255,0.70)' }}>
              Por eso, cada tarjeta también responde a una segunda pregunta:<br />
              <span className="font-semibold" style={{ color: '#ddd6fe' }}>¿necesita atención <i>ahora</i>?</span>
            </p>

            <div className="mt-auto">
              <div className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.50)' }}>Tip</div>
              <div className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.70)' }}>
                Usa los chips de filtro arriba del tablero para ocultar lo saludable y enfocarte solo en lo que necesita acción.
              </div>
              <div className="text-[10px] mt-4 flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.40)' }}>
                <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'ui-monospace,monospace', color: 'rgba(255,255,255,0.7)' }}>
                  Esc
                </kbd>
                para cerrar
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main ─── */}
        <section className="flex flex-col min-w-0 overflow-hidden" style={{ background: '#0c0c0f' }}>
          {/* Header */}
          <header className="flex items-center justify-between px-7 py-5" style={{ borderBottom: '1px solid #1c1c20' }}>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">Estados visuales</div>
              <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">4 estados temporales + saludable</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-7 py-6"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a30 transparent' }}>

            {/* Anatomy */}
            <div className="info-anatomy">
              <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-3">Anatomía</div>
              <div className="flex items-start gap-5 flex-wrap">
                <div style={{ width: 220, flexShrink: 0 }}>
                  <MiniKanbanCard card={{ title: 'Envío de pre-requisitos', priority: 'HIGH', urgency: 'overdue', daysFromDue: -3, ownerName: 'Juan C.' }} />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <AnatomyRow color="#f97316" label="Barra de prioridad" desc="Importancia inherente — HIGH/MEDIUM/LOW/CRITICAL. No cambia." />
                  <AnatomyRow color="#ef4444" label="Tinte + glow" desc="Estado temporal — solo aparece si la tarjeta necesita acción." />
                  <AnatomyRow color="#fda4af" label="Píldora explicativa" desc="Dice exactamente qué pasa: 3d vencida, vence hoy, 9d sin mover." />
                  <AnatomyRow color="#a1a1aa" label="Fecha relativa" desc="Siempre presente, en gris cuando está sana." />
                </div>
              </div>
            </div>

            {/* State cards */}
            <div className="info-states">
              {STATES.map((s) => {
                const Icon = s.icon
                return (
                  <div key={s.id} className="info-state-card">
                    <div className="info-state-card-left"
                      style={{ background: `radial-gradient(60% 80% at 0% 0%, ${s.color}1f, transparent 70%), #101015` }}>
                      <div className="info-state-header">
                        <div className="info-state-icon"
                          style={{ background: `${s.color}22`, borderColor: `${s.color}55`, color: s.color }}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="info-state-title">{s.label}</div>
                          <div className="info-state-rule" style={{ color: s.color }}>{s.rule}</div>
                        </div>
                      </div>
                      <p className="info-state-detail">{s.detail}</p>
                    </div>
                    <div className="info-state-card-right">
                      <MiniKanbanCard card={s.sample} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* AI tip */}
            <div className="flex items-start gap-3 mt-5 px-4 py-3 rounded-xl text-xs leading-relaxed"
              style={{
                background: 'linear-gradient(90deg, rgba(167,139,250,0.10), rgba(99,102,241,0.04))',
                border: '1px solid rgba(167,139,250,0.25)',
                color: 'rgba(255,255,255,0.85)',
              }}>
              <Sparkles size={14} className="text-violet-300 flex-shrink-0 mt-0.5" />
              <span>Próximamente: la IA podrá sugerirte el orden óptimo para atender las tarjetas vencidas y bloqueadas en función de la criticidad del proyecto y la carga del equipo.</span>
            </div>
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-between px-7 py-4" style={{ borderTop: '1px solid #1c1c20', background: '#0a0a0c' }}>
            <span className="text-[11px] text-zinc-500">
              Las reglas (días para "vence pronto", umbral de "estancada") son configurables en Ajustes → Workflow.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: '#4f46e5' }}
            >
              Entendido
            </button>
          </footer>
        </section>
      </div>
    </div>
  )
}
