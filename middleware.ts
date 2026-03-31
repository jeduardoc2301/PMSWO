import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n/config'
import { NextRequest, NextResponse } from 'next/server'

// Create the i18n middleware
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: false, // Disable automatic locale detection from cookies/headers
})

export default function middleware(request: NextRequest) {
  console.log('[MIDDLEWARE] Request URL:', request.url)
  console.log('[MIDDLEWARE] Request pathname:', request.nextUrl.pathname)
  console.log('[MIDDLEWARE] Locales:', locales)
  console.log('[MIDDLEWARE] Default locale:', defaultLocale)
  
  const response = intlMiddleware(request)
  
  // Clear any NEXT_LOCALE cookie to prevent conflicts
  response.cookies.delete('NEXT_LOCALE')
  
  console.log('[MIDDLEWARE] Response status:', response.status)
  console.log('[MIDDLEWARE] Response headers:', Object.fromEntries(response.headers.entries()))
  
  return response
}

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(es|pt)/:path*'],
}
