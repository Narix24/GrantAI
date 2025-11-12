// tests/unit/services/i18nService.unit.test.js
import { i18nService } from '../../../../backend/services/i18nService';
import fs from 'fs/promises';

jest.mock('fs/promises');

describe('i18nService Unit Tests', () => {
  const mockLocales = {
    en: {
      HELLO: 'Hello',
      WELCOME: 'Welcome to {appName}',
      BUTTONS: {
        SUBMIT: 'Submit',
        CANCEL: 'Cancel'
      },
      PLURAL: {
        ONE: 'One item',
        MANY: '{count} items'
      }
    },
    de: {
      HELLO: 'Hallo',
      WELCOME: 'Willkommen bei {appName}',
      BUTTONS: {
        SUBMIT: 'Absenden',
        CANCEL: 'Abbrechen'
      },
      PLURAL: {
        ONE: 'Ein Element',
        MANY: '{count} Elemente'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    i18nService.cache = new Map();
    i18nService.initialized = false;
    i18nService.supportedLanguages = [];

    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    fs.readdir.mockResolvedValue(Object.keys(mockLocales).map(lang => `${lang}.json`));
    fs.readFile.mockImplementation((filePath) => {
      const lang = filePath.match(/([a-z]{2})\.json$/)[1];
      if (!mockLocales[lang]) throw new Error('File not found');
      return JSON.stringify(mockLocales[lang]);
    });
  });

  describe('Initialization', () => {
    test('should load all locales', async () => {
      await i18nService.initialize();
      expect(i18nService.cache.size).toBe(2);
      expect(i18nService.supportedLanguages).toEqual(['en', 'de']);
    });

    test('should handle missing locale files', async () => {
      fs.readFile.mockImplementationOnce(() => { throw new Error('File not found'); });
      await i18nService.initialize();
      expect(console.warn).toHaveBeenCalled();
      expect(i18nService.cache.size).toBe(1);
    });
  });

  describe('Translation', () => {
    beforeEach(async () => { await i18nService.initialize(); });

    test('simple translation', async () => {
      expect(await i18nService.translate('HELLO', 'en')).toBe('Hello');
      expect(await i18nService.translate('HELLO', 'de')).toBe('Hallo');
    });

    test('nested translation', async () => {
      expect(await i18nService.translate('BUTTONS.SUBMIT', 'en')).toBe('Submit');
      expect(await i18nService.translate('BUTTONS.SUBMIT', 'de')).toBe('Absenden');
    });

    test('missing key fallback', async () => {
      expect(await i18nService.translate('MISSING', 'de')).toBe('MISSING');
    });

    test('interpolation', async () => {
      expect(await i18nService.translate('WELCOME', 'en', { appName: 'Grant-AI' }))
        .toBe('Welcome to Grant-AI');
    });

    test('pluralization', async () => {
      expect(await i18nService.translate('PLURAL', 'en', { count: 1 })).toBe('One item');
      expect(await i18nService.translate('PLURAL', 'en', { count: 5 })).toBe('5 items');
    });
  });

  describe('Cache & clearCache', () => {
    test('clear cache resets service', async () => {
      await i18nService.initialize();
      expect(i18nService.cache.size).toBe(2);
      i18nService.clearCache();
      expect(i18nService.cache.size).toBe(0);
      expect(i18nService.initialized).toBe(false);
    });
  });

  describe('Middleware', () => {
    test('sets language from headers', async () => {
      await i18nService.initialize();
      const req = { headers: { 'accept-language': 'de,en;q=0.9' } };
      const next = jest.fn();
      await i18nService.middleware()(req, {}, next);
      expect(req.language).toBe('de');
      expect(next).toHaveBeenCalled();
    });

    test('fallbacks to default language', async () => {
      await i18nService.initialize();
      const req = { headers: {} };
      const next = jest.fn();
      await i18nService.middleware()(req, {}, next);
      expect(req.language).toBe('en');
    });
  });
});
        throw new Error('No database available - MongoDB and SQLite initialization failed');