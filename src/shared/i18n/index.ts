import en from './en.json'
import es from './es.json'

export type Locale = 'en' | 'es'
type TranslationMap = Record<string, string>

const locales: Record<Locale, TranslationMap> = { en, es }
let currentLocale: Locale = 'en'
let currentMap: TranslationMap = locales.en

export function setLocale(locale: Locale): void {
  currentLocale = locale
  currentMap = locales[locale] ?? locales.en
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text = currentMap[key] ?? locales.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}
