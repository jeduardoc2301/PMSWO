'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, X, CalendarCheck2 } from 'lucide-react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecciona fecha',
  min,
  max,
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [popPos, setPopPos] = useState({ top: 0, left: 0, openUp: false })
  const [pickerMode, setPickerMode] = useState<'days' | 'months' | 'years'>('days')

  useEffect(() => { setMounted(true) }, [])

  const parseISO = (s: string | undefined): Date | null => {
    if (!s) return null
    const [y, m, d] = s.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
  }

  const toISO = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const selected = useMemo(() => parseISO(value), [value])
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  }, [])
  const [viewDate, setViewDate] = useState<Date>(() => selected || today)

  useEffect(() => {
    if (selected) setViewDate(selected)
  }, [value])

  useEffect(() => {
    if (!open) return
    const place = () => {
      const r = containerRef.current?.getBoundingClientRect()
      if (!r) return
      const popH = 380
      const openUp = r.bottom + popH + 12 > window.innerHeight && r.top > popH + 12
      setPopPos({
        top: openUp ? r.top - popH - 8 : r.bottom + 8,
        left: Math.min(r.left, window.innerWidth - 312),
        openUp,
      })
    }
    place()
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return
      if (popRef.current?.contains(e.target as Node)) return
      if ((e.target as Element)?.closest?.('[data-datepicker-popup="true"]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }

    // Capture popup element now (popRef.current will be null during cleanup)
    const popEl = popRef.current
    // Stop mousedown from reaching the document listener so onDoc never fires
    // for clicks inside the popup. Uses native DOM (not React synthetic) so it
    // runs in the bubble phase before document receives the event.
    const stopMousedown = (e: MouseEvent) => e.stopPropagation()
    popEl?.addEventListener('mousedown', stopMousedown)

    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      popEl?.removeEventListener('mousedown', stopMousedown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const dayNames = ['L','M','M','J','V','S','D']

  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const offset = (firstOfMonth.getDay() + 6) % 7
    const start = new Date(firstOfMonth)
    start.setDate(start.getDate() - offset)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [viewDate])

  const sameDay = (a: Date | null, b: Date | null) =>
    !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const sameMonth = (a: Date, b: Date) =>
    a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()

  const minDate = parseISO(min)
  const maxDate = parseISO(max)
  const inRange = (d: Date) => (!minDate || d >= minDate) && (!maxDate || d <= maxDate)

  const fmtDisplay = (d: Date | null): string => {
    if (!d) return ''
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const pick = (d: Date) => {
    onChange(toISO(d))
    setOpen(false)
  }

  const nav = (delta: number) => {
    const d = new Date(viewDate)
    if (pickerMode === 'days') d.setMonth(d.getMonth() + delta)
    else if (pickerMode === 'months') d.setFullYear(d.getFullYear() + delta)
    else d.setFullYear(d.getFullYear() + delta * 12)
    setViewDate(d)
  }

  const cycleMode = () => {
    setPickerMode(m => m === 'days' ? 'months' : m === 'months' ? 'years' : 'days')
  }

  const startYear = Math.floor(viewDate.getFullYear() / 12) * 12

  const pop = (
    <div
      ref={popRef}
      className="dp-pop"
      data-datepicker-popup="true"
      style={{ top: popPos.top, left: popPos.left, transformOrigin: popPos.openUp ? 'bottom left' : 'top left' }}
    >
      <div className="dp-header">
        <button type="button" className="dp-nav-btn" onClick={() => nav(-1)} aria-label="Anterior">
          <ChevronLeft style={{ width: 14, height: 14 }} />
        </button>
        <button type="button" className="dp-title" onClick={cycleMode}>
          {pickerMode === 'days' && (
            <>{monthNames[viewDate.getMonth()]} <span style={{ color: '#71717a' }}>{viewDate.getFullYear()}</span></>
          )}
          {pickerMode === 'months' && <>{viewDate.getFullYear()}</>}
          {pickerMode === 'years' && <>{startYear} – {startYear + 11}</>}
          <ChevronDown style={{ width: 14, height: 14, opacity: 0.6 }} />
        </button>
        <button type="button" className="dp-nav-btn" onClick={() => nav(1)} aria-label="Siguiente">
          <ChevronRight style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {pickerMode === 'days' && (
        <>
          <div className="dp-dow">
            {dayNames.map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="dp-grid">
            {grid.map((d, i) => {
              const isToday = sameDay(d, today)
              const isSelected = sameDay(d, selected)
              const isOutside = !sameMonth(d, viewDate)
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              const isDisabled = !inRange(d)
              return (
                <button
                  key={i}
                  type="button"
                  className="dp-day"
                  data-today={isToday || undefined}
                  data-selected={isSelected || undefined}
                  data-outside={isOutside || undefined}
                  data-weekend={isWeekend || undefined}
                  disabled={isDisabled}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </>
      )}

      {pickerMode === 'months' && (
        <div className="dp-month-grid">
          {monthNames.map((m, i) => {
            const active = !!(selected && selected.getMonth() === i && selected.getFullYear() === viewDate.getFullYear())
            return (
              <button
                key={m}
                type="button"
                className="dp-month-cell"
                data-selected={active || undefined}
                onClick={() => {
                  const d = new Date(viewDate)
                  d.setMonth(i)
                  setViewDate(d)
                  setPickerMode('days')
                }}
              >
                {m.slice(0, 3)}
              </button>
            )
          })}
        </div>
      )}

      {pickerMode === 'years' && (
        <div className="dp-month-grid">
          {Array.from({ length: 12 }, (_, k) => {
            const yr = startYear + k
            const active = !!(selected && selected.getFullYear() === yr)
            return (
              <button
                key={yr}
                type="button"
                className="dp-month-cell"
                data-selected={active || undefined}
                onClick={() => {
                  const d = new Date(viewDate)
                  d.setFullYear(yr)
                  setViewDate(d)
                  setPickerMode('months')
                }}
              >
                {yr}
              </button>
            )
          })}
        </div>
      )}

      <div className="dp-footer">
        <button type="button" className="dp-foot-btn" onClick={() => { onChange(''); setOpen(false) }}>
          <X style={{ width: 14, height: 14 }} /> Limpiar
        </button>
        <button type="button" className="dp-foot-btn dp-foot-primary" onClick={() => pick(today)}>
          <CalendarCheck2 style={{ width: 14, height: 14 }} /> Hoy
        </button>
      </div>
    </div>
  )

  return (
    <div ref={containerRef} className={`dp-root${className ? ' ' + className : ''}`}>
      <button
        type="button"
        className="dp-input"
        data-open={open || undefined}
        data-empty={!value || undefined}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <Calendar style={{ width: 14, height: 14 }} />
        <span className="dp-input-text">{value ? fmtDisplay(selected) : placeholder}</span>
        {value && (
          <span
            className="dp-input-clear"
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            title="Limpiar"
          >
            <X style={{ width: 14, height: 14 }} />
          </span>
        )}
        <ChevronDown
          style={{ width: 14, height: 14, flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && mounted && createPortal(pop, document.body)}
    </div>
  )
}
