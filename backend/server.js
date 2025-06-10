require('dotenv').config();
const cors = require('cors');

const { savePolicy } = require('./models/Policy');

const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());
app.use(cors());

app.post('/api/verify-payment', async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user_data
    } = req.body;

    // Create signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        // Payment is verified
        // Generate unique policy number
        const policyNumber = `SS${Date.now().toString().slice(-8)}`;

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
            console.log('Payment verified and policy saved:', policyItem);
            res.json({ success: true, message: 'Payment verified', policyNumber });
        } catch (err) {
            console.error('Error saving policy:', err);
            res.status(500).json({ success: false, message: 'Error saving policy' });
        }
    } else {
        res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
});

app.listen(3001, () => {
    console.log('Server running on port 3001');
});