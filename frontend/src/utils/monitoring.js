import LogRocket from 'logrocket';
import setupLogRocketReact from 'logrocket-react';

if (process.env.NODE_ENV === 'production' && process.env.LOGROCKET_ID) {
  LogRocket.init(process.env.LOGROCKET_ID);
  setupLogRocketReact(LogRocket);
  
  console.log('✅ LogRocket session recording enabled');
}

export const identifyUser = (user) => {
  if (process.env.NODE_ENV === 'production' && process.env.LOGROCKET_ID) {
    LogRocket.identify(user.id, {
      name: user.name,
      email: user.email,
      role: user.role
    });
  }
};

export const captureError = (error, context = {}) => {
  if (process.env.NODE_ENV === 'production' && process.env.LOGROCKET_ID) {
    LogRocket.captureException(error, { extra: context });
  }
};