// backend/services/i18nService.js
import fs from 'fs/promises';
import path from 'path';

class I18nService {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
    this.supportedLanguages = []; // dynamically detected
    this.defaultLanguage = 'en';
    this.localesPath = path.join(__dirname, '../locales');
  }

  // Initialize service: load all JSON locale files
  async initialize() {
    if (this.initialized) return;

    try {
      const files = await fs.readdir(this.localesPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const lang = file.replace('.json', '');
        try {
          const data = await fs.readFile(path.join(this.localesPath, file), 'utf8');
          this.cache.set(lang, JSON.parse(data));
        } catch (err) {
          console.warn(`Failed to load locale "${lang}":`, err);
        }
      }

      this.supportedLanguages = Array.from(this.cache.keys());
      this.initialized = true;
    } catch (err) {
      console.error('Failed to read locales directory:', err);
      throw err;
    }
  }

  // Translate key with options (count for pluralization, variables for interpolation)
  async translate(key, lang = this.defaultLanguage, options = {}) {
    if (!this.initialized) throw new Error('i18n service not initialized');

    const translations = this.cache.get(lang) || this.cache.get(this.defaultLanguage) || {};
    let value = this._getNested(translations, key);

    if (value === undefined) return key; // fallback to key itself

    // Handle pluralization
    if (typeof options.count === 'number' && translations.PLURAL) {
      if (options.count === 1 && translations.PLURAL.ONE) value = translations.PLURAL.ONE;
      if (options.count !== 1 && translations.PLURAL.MANY)
        value = translations.PLURAL.MANY.replace('{count}', options.count);
    }

    // Handle variable interpolation
    if (options) {
      for (const [k, v] of Object.entries(options)) {
        value = value.replace(new RegExp(`{${k}}`, 'g'), v);
      }
    }

    return value;
  }

  // Helper: get nested key like "BUTTONS.SUBMIT"
  _getNested(obj, key) {
    if (!key) return '';
    return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  // Clear cache & reset initialization
  clearCache() {
    this.cache.clear();
    this.initialized = false;
    this.supportedLanguages = [];
  }

  // Express middleware to set req.language based on Accept-Language
  middleware() {
    return async (req, res, next) => {
      let lang = this.defaultLanguage;
      const header = req.headers['accept-language'];
      if (header) {
        const supported = this.supportedLanguages.find(l => header.startsWith(l));
        if (supported) lang = supported;
      }
      req.language = lang;
      next();
    };
  }
}

export const i18nService = new I18nService();
export default i18nService;