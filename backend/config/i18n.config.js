export const I18N_CONFIG = {
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ro', 'ru'],
  fallbackLanguage: 'en',
  localesPath: './backend/locales',
  cacheTTL: 3600000, // 1 hour
  detection: {
    order: ['query', 'cookie', 'header', 'path'],
    lookupQuery: 'lang',
    lookupCookie: 'lang',
    lookupHeader: 'accept-language',
    caches: ['cookie'],
    cookieExpirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  },
  formatting: {
    number: {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    },
    currency: {
      currency: 'USD',
      minimumFractionDigits: 2
    },
    date: {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
  },
  providers: {
    primary: 'local',
    fallback: 'google_translate',
    google: {
      apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
      endpoint: 'https://translation.googleapis.com/language/translate/v2'
    }
  }
};