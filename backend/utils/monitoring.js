import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [
      Sentry.expressIntegration(),
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });

  console.log('✅ Sentry monitoring enabled');
}

export const monitoring = {
  captureException: (error, context = {}) => {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      Sentry.captureException(error, { contexts: { custom: context } });
    }
  },
  captureMessage: (message, level = 'info') => {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      Sentry.captureMessage(message, level);
    }
  },
  setUser: (user) => {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      Sentry.setUser(user);
    }
  }
};
