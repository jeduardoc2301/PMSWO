import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import { locales } from '@/i18n/config'
import { SessionProviderWrapper } from '@/components/providers/session-provider-wrapper'
import '../globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

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

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProviderWrapper>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
