import { useContext } from 'react'
import { LanguageContext } from './LanguageContext'
import { t as translate } from '../i18n'

interface UseTranslationReturn {
  t: (key: string, vars?: Record<string, string | number>) => string
  locale: string
}

/**
 * React hook for translations. Must be used inside a LanguageProvider.
 * The hook subscribes to locale changes so components re-render on language switch.
 */
export function useTranslation(): UseTranslationReturn {
  // Reading the context ensures the component re-renders when locale changes
  const { locale } = useContext(LanguageContext)
  // We still delegate to the module-level `t` which reads the same locale
  void locale
  return { t: translate, locale }
}
