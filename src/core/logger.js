const winston = require('winston');
const path = require('path');

class Logger {
  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              let log = `${timestamp} [${service || 'APP'}] ${level}: ${message}`;
              if (Object.keys(meta).length > 0) {
                log += ` ${JSON.stringify(meta)}`;
              }
              return log;
            })
          )
        })
      ]
    });
  }

  createServiceLogger(serviceName) {
    return {
      info: (message, meta = {}) => this.logger.info(message, { service: serviceName, ...meta }),
      error: (message, meta = {}) => this.logger.error(message, { service: serviceName, ...meta }),
      warn: (message, meta = {}) => this.logger.warn(message, { service: serviceName, ...meta }),
      debug: (message, meta = {}) => this.logger.debug(message, { service: serviceName, ...meta })
    };
  }
}

module.exports = new Logger();
