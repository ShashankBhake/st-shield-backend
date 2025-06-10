const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Define custom format for console in development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ' ' + JSON.stringify(meta, null, 2);
        }
        return msg;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
        service: 'st-shield-backend',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
    },
    transports: [
        // Error logs
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
        }),
        // Warning logs
        new winston.transports.File({
            filename: path.join(logsDir, 'warn.log'),
            level: 'warn',
            maxsize: 5242880, // 5MB
            maxFiles: 3,
        }),
        // Application logs (info and above)
        new winston.transports.File({
            filename: path.join(logsDir, 'app.log'),
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
        }),
        // Debug logs (only in development)
        ...(process.env.NODE_ENV === 'development' ? [
            new winston.transports.File({
                filename: path.join(logsDir, 'debug.log'),
                level: 'debug',
                maxsize: 5242880, // 5MB
                maxFiles: 2,
            })
        ] : []),
        // Console logging
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ?
                winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                ) : consoleFormat
        })
    ],
});

// Create request logger middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9);

    // Add request ID to request object for use in other middlewares
    req.requestId = requestId;

    // Log request with more details
    logger.info('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type'),
        contentLength: req.get('Content-Length'),
        origin: req.get('Origin'),
        referer: req.get('Referer')
    });

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function (body) {
        const duration = Date.now() - start;
        const responseData = {
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            responseSize: JSON.stringify(body).length
        };

        // Log different levels based on status code
        if (res.statusCode >= 500) {
            logger.error('Server error response', { ...responseData, responseBody: body });
        } else if (res.statusCode >= 400) {
            logger.warn('Client error response', { ...responseData, responseBody: body });
        } else {
            logger.info('Successful response', responseData);
        }

        return originalJson.call(this, body);
    };

    // Log unhandled errors in the request
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            logger.warn('Request completed with error status', {
                requestId,
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${Date.now() - start}ms`
            });
        }
    });

    next();
};

// Create error logging utility functions
const logError = (error, context = {}) => {
    logger.error('Application error', {
        error: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        ...context
    });
};

const logWarning = (message, context = {}) => {
    logger.warn(message, context);
};

const logInfo = (message, context = {}) => {
    logger.info(message, context);
};

const logDebug = (message, context = {}) => {
    logger.debug(message, context);
};

// Performance monitoring utility
const logPerformance = (operation, duration, context = {}) => {
    const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
    logger[level]('Performance metric', {
        operation,
        duration: `${duration}ms`,
        slow: duration > 1000,
        ...context
    });
};

module.exports = {
    logger,
    requestLogger,
    logError,
    logWarning,
    logInfo,
    logDebug,
    logPerformance
};
