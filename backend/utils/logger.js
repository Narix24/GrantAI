import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, label, printf, colorize, json } = winston.format;

// 🔧 Safe stringify (handles circular refs)
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (value instanceof Error) {
        return { message: value.message, stack: value.stack };
      }
      return value;
    },
    2
  );
}

// 🏷️ Console format
const consoleFormat = printf(({ level, message, label, timestamp, correlationId, ...metadata }) => {
  let msg = `${timestamp} [${label}] ${level}: ${message}`;
  if (correlationId) msg += ` | CorrelationID: ${correlationId}`;
  if (Object.keys(metadata).length > 0) msg += `\n${safeStringify(metadata)}`;
  return msg;
});

// 📦 File format
const fileFormat = combine(timestamp(), json());

// 🌐 Correlation middleware
export const correlationMiddleware = (req, res, next) => {
  const existing = req.headers['x-correlation-id'];
  const id = existing || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
};

// 🏗️ Winston logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'grant-ai' },
  transports: [
    new winston.transports.Console({
      format: combine(label({ label: 'Grant-AI' }), colorize(), consoleFormat),
    }),
    new DailyRotateFile({
      filename: 'logs/grant-ai-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
  ],
  exitOnError: false,
});

// 🧱 Logger wrapper with test-friendly proxies
export const logger = {
  info: (message, meta = {}) => {
    const cleaned = JSON.parse(safeStringify(meta));
    winston.Logger.prototype.info(message, cleaned);
  },
  error: (message, meta = {}) => {
    const cleaned = JSON.parse(safeStringify(meta));
    if (meta?.error instanceof Error) {
      cleaned.error = meta.error.message;
      cleaned.stack = meta.error.stack;
    }
    winston.Logger.prototype.error(message, cleaned);
  },
  stream: {
    write: (message) => winston.Logger.prototype.info(message.trim()),
  },
  performance: (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(`${req.method} ${req.url}`, {
        correlationId: req.correlationId,
        duration,
        statusCode: res.statusCode,
      });
    });
    next();
  },
};

// 🧩 Error middleware
export const errorMiddleware = (err, req, res, next) => {
  logger.error(`${err.statusCode || 500} ${req.method} ${req.url}`, {
    error: err.message,
    stack: err.stack,
    correlationId: req.correlationId,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
  res.statusCode = err.statusCode || 500;
  next();
};

// 🚨 Global error handling
process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', error);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('UNHANDLED REJECTION', err);
});

export default logger;