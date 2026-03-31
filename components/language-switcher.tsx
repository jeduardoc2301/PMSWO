'use client'

interface LanguageSwitcherProps {
  currentLocale: string
}

export function LanguageSwitcher({ currentLocale }: LanguageSwitcherProps) {
  const handleLanguageChange = (locale: string) => {
    window.location.href = `/${locale}`
  }

  return (
    <div className="absolute top-6 right-6 z-20 flex gap-3">
      <button
        onClick={() => handleLanguageChange('es')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          currentLocale === 'es'
            ? 'bg-white text-blue-600'
            : 'bg-white/20 text-white hover:bg-white/30'
        }`}
      >
        🇪🇸 Español
      </button>
      <button
        onClick={() => handleLanguageChange('pt')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          currentLocale === 'pt'
            ? 'bg-white text-blue-600'
            : 'bg-white/20 text-white hover:bg-white/30'
        }`}
      >
        🇧🇷 Português
      </button>
    </div>
  )
}
