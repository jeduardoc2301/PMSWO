import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n/config'
import { NextRequest, NextResponse } from 'next/server'

// Create the i18n middleware
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

export default function middleware(request: NextRequest) {
  console.log('[MIDDLEWARE] Request URL:', request.url)
  console.log('[MIDDLEWARE] Request pathname:', request.nextUrl.pathname)
  console.log('[MIDDLEWARE] Locales:', locales)
  console.log('[MIDDLEWARE] Default locale:', defaultLocale)
  
  const response = intlMiddleware(request)
  
  console.log('[MIDDLEWARE] Response status:', response.status)
  console.log('[MIDDLEWARE] Response headers:', Object.fromEntries(response.headers.entries()))
  
  return response
}

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(es|pt)/:path*'],
}
