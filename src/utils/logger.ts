/**
 * Logger utility for conditional logging based on environment
 * In production, logs are disabled by default unless ENABLE_LOGS is set to 'true'
 */

const isDevelopment = process.env.NODE_ENV === "development";
const isLoggingEnabled = process.env.ENABLE_LOGS === "true" || isDevelopment;

export const logger = {
  log: (...args: any[]) => {
    if (isLoggingEnabled) {
      console.log(...args);
    }
  },

  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  },

  warn: (...args: any[]) => {
    if (isLoggingEnabled) {
      console.warn(...args);
    }
  },

  info: (...args: any[]) => {
    if (isLoggingEnabled) {
      console.info(...args);
    }
  },

  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
};

export default logger;
