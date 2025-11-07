// backend/utils/metrics.js
import winston from 'winston';
import { format } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, label, printf, colorize, json } = format;

// 🏷️ Custom format for console output
const consoleFormat = printf(({ level, message, label, timestamp, correlationId, ...metadata }) => {
  let msg = `${timestamp} [${label}] ${level}: ${message}`;
  if (correlationId) msg += ` | CorrelationID: ${correlationId}`;
  if (Object.keys(metadata).length > 0) {
    msg += `\n${JSON.stringify(metadata, null, 2)}`;
  }
  return msg;
});

// 📦 JSON format for file logging
const fileFormat = combine(timestamp(), json());

// 🌐 Correlation ID middleware
export const correlationMiddleware = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};

// 🏗️ Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'grant-ai' },
  transports: [
    new winston.transports.Console({
      format: combine(label({ label: 'Grant-AI' }), colorize(), consoleFormat),
      handleExceptions: true,
      handleRejections: true,
    }),
    new DailyRotateFile({
      filename: 'logs/grant-ai-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// 🚨 Exception handling
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', error);
  import('../orchestration/recoveryOrchestrator.js').then(({ recoveryOrchestrator }) => {
    recoveryOrchestrator?.triggerRecovery?.(error, { type: 'uncaught_exception' });
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION', { reason, promise });
});

// 🧵 Request-scoped logging
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

// 📊 Performance logging
export const logPerformance = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6;

    logger.info(`${req.method} ${req.url}`, {
      correlationId: req.correlationId,
      duration: `${duration.toFixed(2)}ms`,
      statusCode: res.statusCode,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });

  next();
};

// ✅ Proposal validation helper
export const validateProposal = (data) => {
  const errors = [];
  if (!data.opportunity) errors.push('Opportunity is required');
  if (!data.organization) errors.push('Organization is required');
  if (!data.missionStatement) errors.push('Mission statement is required');

  if (errors.length) {
    return { error: { details: errors.map((msg) => ({ message: msg })) } };
  }
  return { value: data };
};

export default logger;