import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

/**
 * Root page that redirects to the default locale
 * This ensures users always land on a localized route
 */
export default function RootPage() {
  redirect(`/${defaultLocale}`)
}
