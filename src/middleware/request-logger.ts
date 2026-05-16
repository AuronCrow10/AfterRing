// src/middleware/request-logger.ts
import pinoHttp from 'pino-http';
import logger from '../config/logger';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode
      };
    }
  }
});
