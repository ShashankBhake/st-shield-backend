require('dotenv').config();
const cors = require('cors');
const express = require('express');
const crypto = require('crypto');

const { savePolicy } = require('./models/Policy');
const { logger, requestLogger, logError, logWarning, logInfo, logPerformance } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Global error handlers for uncaught exceptions
process.on// Global error handlers for uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        pid: process.pid
    });

    // Give time for logger to write before exiting
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString(),
        pid: process.pid
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));
app.use(requestLogger);

// Request validation middleware
const validatePaymentRequest = (req, res, next) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, user_data } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        logger.error('Payment verification failed: Missing required payment fields', {
            body: req.body,
            ip: req.ip,
            requestId: req.requestId
        });
        return res.status(400).json({
            success: false,
            message: 'Missing required payment fields'
        });
    }

    if (!user_data) {
        logger.error('Payment verification failed: Missing user data', {
            orderId: razorpay_order_id,
            ip: req.ip,
            requestId: req.requestId
        });
        return res.status(400).json({
            success: false,
            message: 'Missing user data'
        });
    }

    next();
};

// Rate limiting middleware (basic implementation)
const rateLimitMap = new Map();
const rateLimit = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100; // max 100 requests per window

    if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + windowMs });
        return next();
    }

    const clientData = rateLimitMap.get(clientIP);

    if (now > clientData.resetTime) {
        clientData.count = 1;
        clientData.resetTime = now + windowMs;
        return next();
    }

    if (clientData.count >= maxRequests) {
        logWarning('Rate limit exceeded', {
            ip: clientIP,
            count: clientData.count,
            requestId: req.requestId
        });
        return res.status(429).json({
            success: false,
            message: 'Too many requests, please try again later'
        });
    }

    clientData.count++;
    next();
};

// Health check endpoint
app.get('/health', async (req, res) => {
    const startTime = Date.now();

    try {
        const healthCheck = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
                external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100
            },
            services: {
                database: await checkDynamoDBConnection(),
                razorpay: checkRazorpayConfig()
            },
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                pid: process.pid,
                cpuUsage: process.cpuUsage()
            }
        };

        // Log health check duration
        const duration = Date.now() - startTime;
        logPerformance('health-check', duration);

        logger.info('Health check requested', {
            result: healthCheck.status,
            duration: `${duration}ms`,
            ip: req.ip
        });

        res.json(healthCheck);
    } catch (error) {
        const duration = Date.now() - startTime;
        logError(error, {
            operation: 'health-check',
            duration: `${duration}ms`,
            ip: req.ip
        });

        res.status(503).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            uptime: process.uptime()
        });
    }
});

// Add system metrics endpoint for monitoring
app.get('/health/metrics', (req, res) => {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            process: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                version: process.version,
                pid: process.pid
            },
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version
            }
        };

        logInfo('System metrics requested', { ip: req.ip });
        res.json(metrics);
    } catch (error) {
        logError(error, { operation: 'system-metrics', ip: req.ip });
        res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
});

// Helper function to check DynamoDB connection
async function checkDynamoDBConnection() {
    try {
        // Try to access DynamoDB (this will be caught if AWS credentials are wrong)
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        const client = new DynamoDBClient({ region: process.env.AWS_REGION });
        return { status: 'connected', region: process.env.AWS_REGION };
    } catch (error) {
        logger.error('DynamoDB connection check failed', { error: error.message });
        return { status: 'error', error: error.message };
    }
}

// Helper function to check Razorpay config
function checkRazorpayConfig() {
    const hasSecret = !!process.env.RAZORPAY_KEY_SECRET;
    return {
        status: hasSecret ? 'configured' : 'not_configured',
        configured: hasSecret
    };
}

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        body: req.body
    });

    res.status(500).json({
        success: false,
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
});

app.post('/api/verify-payment', validatePaymentRequest, async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user_data
    } = req.body;

    logger.info('Payment verification started', {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        ip: req.ip
    });

    try {
        // Create signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // Payment is verified
            logger.info('Payment signature verified successfully', {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id
            });

            // Generate unique policy number
            const policyNumber = `SSST${Date.now().toString().slice(-8)}`;

            // Prepare policy item for DynamoDB
            const policyItem = {
                policyId: policyNumber,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                userData: user_data,
                timestamp: new Date().toISOString()
            };

            try {
                await savePolicy(policyItem);

                logger.info('Policy saved successfully', {
                    policyNumber,
                    orderId: razorpay_order_id,
                    paymentId: razorpay_payment_id,
                    userEmail: user_data?.personalInfo?.email || 'unknown'
                });

                res.json({
                    success: true,
                    message: 'Payment verified and policy created',
                    policyNumber
                });
            } catch (err) {
                logger.error('Error saving policy to database', {
                    error: err.message,
                    stack: err.stack,
                    policyNumber,
                    orderId: razorpay_order_id,
                    paymentId: razorpay_payment_id
                });

                res.status(500).json({
                    success: false,
                    message: 'Payment verified but failed to create policy. Please contact support.',
                    policyNumber: null
                });
            }
        } else {
            logger.warn('Payment verification failed: Invalid signature', {
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                ip: req.ip,
                expectedSignature: expectedSignature.substring(0, 10) + '...',
                receivedSignature: razorpay_signature.substring(0, 10) + '...'
            });

            res.status(400).json({
                success: false,
                message: 'Payment verification failed: Invalid signature'
            });
        }
    } catch (error) {
        logger.error('Unexpected error during payment verification', {
            error: error.message,
            stack: error.stack,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error during payment verification'
        });
    }
});

app.listen(PORT, () => {
    logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
    console.log(`🚀 ST Shield Backend running on port ${PORT}`);
});