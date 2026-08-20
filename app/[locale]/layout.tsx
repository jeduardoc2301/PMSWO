import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import { locales } from '@/i18n/config'
import { SessionProviderWrapper } from '@/components/providers/session-provider-wrapper'
import { Toaster } from '@/components/ui/toaster'
import '../globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

import { guionSinParpadeo } from '@/lib/projects/tema'

export const metadata: Metadata = {
  title: {
    template: '%s | Gestión de Proyectos Ejecutiva',
    default: 'Gestión de Proyectos Ejecutiva',
  },
  description:
    'Plataforma SaaS multi-tenant para gestión de proyectos ejecutivos con metodología ágil Kanban y asistencia de IA',
  keywords: [
    'gestión de proyectos',
    'kanban',
    'project management',
    'saas',
    'multi-tenant',
    'IA',
    'AWS Bedrock',
  ],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Generate static params for all locales
export function generateStaticParams() {
  console.log('[LAYOUT] generateStaticParams called, locales:', locales)
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  console.log('[LAYOUT] LocaleLayout called, params:', params)
  
  const { locale } = await params
  console.log('[LAYOUT] Locale resolved:', locale)

  // Validate locale
  if (!locales.includes(locale as any)) {
    console.error('[LAYOUT] Invalid locale:', locale, 'Valid locales:', locales)
    notFound()
  }

  // Enable static rendering
  setRequestLocale(locale)
  console.log('[LAYOUT] setRequestLocale called with:', locale)

  const messages = await getMessages({ locale })
  console.log('[LAYOUT] Messages loaded, keys:', Object.keys(messages))
  console.log('[LAYOUT] Messages structure:', JSON.stringify(Object.keys(messages), null, 2))
  console.log('[LAYOUT] Common messages:', messages.common ? Object.keys(messages.common) : 'NOT FOUND')
  console.log('[LAYOUT] Cache-bust timestamp:', new Date().toISOString())

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/*
          El tema, estampado **antes del primer pintado** (brecha 28).

          El servidor no sabe qué eligió esta persona —la elección vive en el navegador—, así que sin
          esto la página llega sin estampar y se pinta oscura un instante antes de que React la
          corrija. Un parpadeo de oscuro a claro en cada navegación es peor que no tener modo claro.

          Va en línea y no como módulo porque tiene que correr síncrono y antes que nada: cualquier
          cosa que Next cargue como módulo llega después del primer pintado. `suppressHydrationWarning`
          en `<html>` es por lo mismo — el atributo que este guión añade no está en lo que sirvió el
          servidor, y eso es exactamente lo que se busca.
        */}
        <script dangerouslySetInnerHTML={{ __html: guionSinParpadeo() }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProviderWrapper>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </SessionProviderWrapper>
        {/* Una sola vez, aquí. Ocho diálogos de producción llevaban avisando de sus errores a la
            consola del navegador porque no había dónde dibujarlos. */}
        <Toaster />
      </body>
    </html>
  )
}
