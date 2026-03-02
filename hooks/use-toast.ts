import { useState, useCallback } from 'react'

export interface Toast {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((toast: Toast) => {
    // For now, we'll use browser alert as a simple implementation
    // In a production app, this would show a proper toast notification
    if (toast.variant === 'destructive') {
      console.error(`${toast.title}: ${toast.description}`)
    } else {
      console.log(`${toast.title}: ${toast.description}`)
    }
    
    setToasts((prev) => [...prev, toast])
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t !== toast))
    }, 3000)
  }, [])

  return { toast, toasts }
}
