import { createContext, useState, useEffect, type ReactNode } from 'react'
import { setLocale, type Locale } from '../i18n'

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
})

interface LanguageProviderProps {
  initialLocale: Locale
  children: ReactNode
}

export function LanguageProvider({ initialLocale, children }: LanguageProviderProps): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  // Sync module-level locale when React state changes
  useEffect(() => {
    setLocale(locale)
  }, [locale])

  // Keep in sync when parent changes initialLocale (e.g. settings reload)
  useEffect(() => {
    setLocaleState(initialLocale)
    setLocale(initialLocale)
  }, [initialLocale])

  const value: LanguageContextValue = {
    locale,
    setLocale: (l: Locale) => {
      setLocaleState(l)
      setLocale(l)
    },
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
