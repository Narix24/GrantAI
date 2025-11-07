// backend/services/i18nService.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

class I18nService {
  constructor() {
    this.initialized = false;
    this.supportedLanguages = ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ro', 'ru'];
  }

  async initialize() {
    try {
      await i18n
        .use(Backend)
        .use(LanguageDetector)
        .use(initReactI18next)
        .init({
          fallbackLng: 'en',
          debug: process.env.NODE_ENV === 'development',
          interpolation: {
            escapeValue: false, // React already does escaping
          },
          backend: {
            loadPath: '/locales/{{lng}}/{{ns}}.json'
          }
        });
      
      this.initialized = true;
      console.log('✅ i18n service initialized successfully');
      return i18n;
    } catch (error) {
      console.error('❌ Failed to initialize i18n service:', error);
      throw error;
    }
  }

  async translate(key, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    return i18n.t(key, options);
  }

  changeLanguage(lng) {
    return i18n.changeLanguage(lng);
  }
}

export const i18nService = new I18nService();
export default i18nService;