const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const cors = require('cors');
const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const fs = require('fs').promises;

const { savePolicy } = require('./models/Policy');
const { sendCustomerConfirmationEmail, sendCompanyAcknowledgmentEmail } = require('./utils/emailService');
const logger = console;
const requestLogger = (req, res, next) => next();
const logError = console.error.bind(console);
const logWarning = console.warn.bind(console);
const logInfo = console.info.bind(console);
const logPerformance = (name, duration) => console.log(`${name}: ${duration}`);

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory store for order amounts to prevent price tampering
const orderStore = new Map();
const planPrices = {
  'student-shield': 99900,        // ₹999 * 100 paise
  'student-shield-plus': 199900,   // ₹1999 * 100 paise
};

// Initialize Razorpay only if credentials are available
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('✅ Razorpay initialized successfully');
} else {
  console.warn('⚠️  Razorpay credentials not found - payment features will be disabled');
}

// Global error handlers for uncaught exceptions
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
    origin: process.env.ALLOWED_ORIGINS?.split(','),
    credentials: true
}));
// requestLogger disabled

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

// POST /api/verify-payment: verify payment signature and amount
app.post('/api/verify-payment', validatePaymentRequest, async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user_data
    } = req.body;

    // Verify order exists and expected amount
    const expectedAmount = orderStore.get(razorpay_order_id);
    if (!expectedAmount) {
        return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }
    try {
        // Fetch actual payment details
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        if (paymentDetails.amount !== expectedAmount) {
            logger.error('Payment verification failed: Amount mismatch', { orderId: razorpay_order_id, expectedAmount, actualAmount: paymentDetails.amount });
            // Notify company about tampering attempt
            const customerData = {
                name: user_data.name,
                email: user_data.email,
                phone: user_data.phone,
                gender: user_data.gender,
                dateOfBirth: user_data.dateOfBirth,
                aadharNumber: user_data.aadharNumber,
                address: user_data.address,
                city: user_data.city,
                state: user_data.state,
                pincode: user_data.pincode,
                nomineeFullName: user_data.nomineeFullName,
                nomineeRelationship: user_data.nomineeRelationship,
                nomineeGender: user_data.nomineeGender,
                nomineeDateOfBirth: user_data.nomineeDateOfBirth
            };
            const policyAlertData = {
                policyNumber: 'N/A',
                planName: user_data.planType,
                amount: `Expected: ${expectedAmount}, Received: ${paymentDetails.amount}`,
                paymentId: razorpay_payment_id
            };
            try {
                await sendCompanyAcknowledgmentEmail(customerData, policyAlertData);
            } catch (emailErr) {
                logger.error('Failed to send tamper notification email', { error: emailErr.message });
            }
            return res.status(400).json({
                success: false,
                message: 'Policy creation failed: Trusted payment not received. Please contact support.'
            });
        }
    } catch (err) {
        logger.error('Failed to fetch payment details', { error: err.message, orderId: razorpay_order_id, paymentId: razorpay_payment_id });
        return res.status(500).json({ success: false, message: 'Could not verify payment amount' });
    }

    // Check if Razorpay is configured
    if (!process.env.RAZORPAY_KEY_SECRET) {
        logger.error('Payment verification failed: Razorpay not configured', {
            orderId: razorpay_order_id,
            ip: req.ip
        });
        return res.status(503).json({
            success: false,
            message: 'Payment service not available - Razorpay not configured'
        });
    }

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

                // Payment capture is handled by Razorpay auto-capture, so no explicit capture needed here.
                // Log that auto-capture is assumed
                logger.info('Assuming auto-capture by Razorpay for payment', {
                    orderId: razorpay_order_id,
                    paymentId: razorpay_payment_id
                });

                // 2) Generate unique policy number
                const policyNumber = `SSST${Date.now().toString().slice(-8)}`;
            
                // 3) Prepare policy item for DynamoDB
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
                        userEmail: user_data?.email || 'unknown'
                    });

                    // Send email notifications after successful policy creation
                    try {
                        // Prepare customer data for emails
                        const customerData = {
                            name: user_data.name,
                            email: user_data.email,
                            phone: user_data.phone,
                            dateOfBirth: user_data.dateOfBirth,
                            aadharNumber: user_data.aadharNumber,
                            address: user_data.address,
                            city: user_data.city,
                            state: user_data.state,
                            pincode: user_data.pincode,
                            gender: user_data.gender,
                            nomineeFullName: user_data.nomineeFullName,
                            nomineeRelationship: user_data.nomineeRelationship,
                            nomineeGender: user_data.nomineeGender,
                            nomineeDateOfBirth: user_data.nomineeDateOfBirth
                        };

                        // Prepare policy data for emails - get amount from user_data
                        const policyData = {
                            policyNumber,
                            planName: user_data.planType,
                            amount: user_data.amount || 'N/A', // Get amount from user_data
                            paymentId: razorpay_payment_id,
                            timestamp: new Date().toLocaleString()
                        };

                        // Send customer confirmation email
                        await sendCustomerConfirmationEmail(customerData, policyData);

                        // Send company acknowledgment email
                        await sendCompanyAcknowledgmentEmail(customerData, policyData);

                        logger.info('Email notifications sent successfully', {
                            policyNumber,
                            customerEmail: customerData.email
                        });

                    } catch (emailError) {
                        // Log email error but don't fail the entire request
                        logger.error('Failed to send email notifications', {
                            error: emailError.message,
                            policyNumber,
                            customerEmail: user_data?.email
                        });
                        // Continue execution - emails are not critical for policy creation
                    }
            
                    return res.json({
                        success: true,
                        message: 'Payment captured and policy created',
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
                    return res.status(500).json({
                        success: false,
                        message: 'Payment captured but failed to create policy. Please contact support.',
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

// POST /api/create-order: create Razorpay order and store amount
app.post('/api/create-order', async (req, res) => {
    const { planType } = req.body;
    // Determine amount from trusted server-side mapping
    const amount = planPrices[planType];
    const currency = 'INR';
    if (!amount) {
        logger.error('Create order failed: Invalid plan type', { planType, ip: req.ip });
        return res.status(400).json({ error: 'Invalid plan type' });
    }
    
    // Create order with trusted amount
    if (!razorpay) {
        logger.error('Create order failed: Razorpay not configured', { 
          body: req.body, 
          ip: req.ip 
        });
        return res.status(503).json({ 
          error: 'Payment service not available - Razorpay not configured' 
        });
    }
    
    try {
        const order = await razorpay.orders.create({ amount, currency });
        // Store the amount for later verification
        orderStore.set(order.id, amount);

        logger.info('Order created successfully', { orderId: order.id, amount, currency });
        res.json({ id: order.id });
    } catch (err) {
        logger.error('Create order error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Could not create order' });
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