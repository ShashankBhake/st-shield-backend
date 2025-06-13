/**
 * Send email using Brevo API directly with HTTP requests
 * @param {Object} emailData - Email configuration object
 */
async function sendBrevoEmail(emailData) {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Brevo API error: ${response.status} - ${errorData}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Brevo API request failed', error);
        throw error;
    }
}

/**
 * Send customer policy confirmation email
 * @param {Object} customerData - Customer information
 * @param {Object} policyData - Policy details
 */
async function sendCustomerConfirmationEmail(customerData, policyData) {
    try {
        const emailData = {
            sender: {
                name: "Student Shield",
                email: process.env.SENDER_EMAIL
            },
            to: [{
                email: customerData.email,
                name: customerData.name
            }],
            subject: `Policy Confirmation - ${policyData.policyNumber}`,
            htmlContent: generateCustomerEmailTemplate(customerData, policyData),
            textContent: generateCustomerTextContent(customerData, policyData)
        };

        const result = await sendBrevoEmail(emailData);
        
        console.info('Customer confirmation email sent successfully', result);

        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Failed to send customer confirmation email', error);
        throw error;
    }
}

/**
 * Send company acknowledgment email
 * @param {Object} customerData - Customer information
 * @param {Object} policyData - Policy details
 */
async function sendCompanyAcknowledgmentEmail(customerData, policyData) {
    try {
        const emailData = {
            sender: {
                name: "Student Shield System",
                email: process.env.SENDER_EMAIL
            },
            to: [{
                email: process.env.COMPANY_EMAIL,
                name: "Student Shield Team"
            }],
            subject: `New Policy Created - ${policyData.policyNumber}`,
            htmlContent: generateCompanyEmailTemplate(customerData, policyData),
            textContent: generateCompanyTextContent(customerData, policyData)
        };

        const result = await sendBrevoEmail(emailData);
        
        console.info('Company acknowledgment email sent successfully', result);

        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Failed to send company acknowledgment email', error);
        throw error;
    }
}

/**
 * Send email campaign using Brevo API directly (similar to your curl example)
 * @param {Object} campaignData - Campaign configuration object
 */
async function sendEmailCampaign(campaignData) {
    try {
        const response = await fetch('https://api.brevo.com/v3/emailCampaigns', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify(campaignData)
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Brevo Campaign API error: ${response.status} - ${errorData}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Brevo Campaign API request failed', error);
        throw error;
    }
}

/**
 * Generate HTML email template for customer
 */
function generateCustomerEmailTemplate(customerData, policyData) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Policy Confirmation</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #DC2626, #EF4444); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding: 20px; color: #666; }
        .help { background: #DC2626; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to Student Shield!</h1>
            <p>Your policy will be issued soon!</p>
        </div>
        <div class="content">
            <p>Dear ${customerData.name},</p>
            <p>Congratulations! Your Student Shield policy has been successfully created. You're now protected with comprehensive coverage designed specifically for students in collaboration with MicroNsure.</p>
            <div class="details">
                <h3>Details:</h3>
                <p><strong>Reference Number:</strong> ${policyData.policyNumber}</p>
                <p><strong>Plan:</strong> ${policyData.planName}</p>
                <p><strong>Premium Paid:</strong> ₹${policyData.amount}</p>
                <p><strong>Policy Holder:</strong> ${customerData.name}</p>
                <p><strong>Email:</strong> ${customerData.email}</p>
                <p><strong>Phone:</strong> ${customerData.phone}</p>
                <p><strong>Policy Date:</strong> ${policyData.timestamp.split(',')[0]}</p>
                <p><strong>Payment ID:</strong> ${policyData.paymentId}</p>
                <p><strong>Nominee Name:</strong> ${customerData.nomineeFullName}</p>
                <p><strong>Nominee Relationship:</strong> ${customerData.nomineeRelationship}</p>
            </div>
            <div class="help">
                <h3>📞 Need Help?</h3>
                <p><strong>Email:</strong> support@studentshield.in</p>
                <p><strong>Phone:</strong> 1800-123-4567</p>
                <p><strong>Support Hours:</strong> Mon-Fri, 9 AM - 6 PM</p>
            </div>
            <p>Note: Your policy copy will be sent to your email id within 24-48 hours.</p>
            <h3>🎯 What's Next?</h3>
            <ul>
                <li>✅ Your coverage will start after policy is active</li>
                <li>✅ Policy document will be sent separately</li>
                <li>✅ Keep this policy reference number for future reference</li>
            </ul>
            <p>Thank you for choosing Student Shield.</p>
            <p>We're committed to protecting your educational & Health journey!</p>
        </div>
        <div class="footer">
            <p>This is an automated email. Please do not reply.</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate text content for customer email
 */
function generateCustomerTextContent(customerData, policyData) {
    return `
🎉 Welcome to Student Shield!

Your policy will be issued soon!

Dear ${customerData.name},

Congratulations! Your Student Shield policy has been successfully created. You're now protected with comprehensive coverage designed specifically for students in collaboration with MicroNsure.

Details:
Reference Number: ${policyData.policyNumber}
Plan: ${policyData.planName}
Premium Paid: ₹${policyData.amount}
Policy Holder: ${customerData.name}
Email: ${customerData.email}
Phone: ${customerData.phone}
Policy Date: ${policyData.timestamp.split(',')[0]}
Payment ID: ${policyData.paymentId}
Nominee Name: ${customerData.nomineeFullName}
Nominee Relationship: ${customerData.nomineeRelationship}

📞 Need Help?
Email: support@studentshield.in
Phone: 1800-123-4567
Support Hours: Mon-Fri, 9 AM - 6 PM

Note: Your policy copy will be sent to your email id within 24-48 hours.

🎯 What's Next?
✅ Your coverage will start after policy is active
✅ Policy document will be sent separately
✅ Keep this policy reference number for future reference

Thank you for choosing Student Shield.

We're committed to protecting your educational & Health journey!
`;
}

/**
 * Generate HTML email template for company
 */
function generateCompanyEmailTemplate(customerData, policyData) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>New Policy Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1f2937; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; }
        .details { background: white; padding: 15px; margin: 10px 0; border-left: 3px solid #DC2626; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>🔔 New Policy Created</h2>
        </div>
        
        <div class="content">
            <div class="details">
                <h3>Policy Information</h3>
                <p><strong>Policy Number:</strong> ${policyData.policyNumber}</p>
                <p><strong>Plan:</strong> ${policyData.planName}</p>
                <p><strong>Premium:</strong> ₹${policyData.amount}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Payment ID:</strong> ${policyData.paymentId}</p>
            </div>
            
            <div class="details">
                <h3>Customer Information</h3>
                <p><strong>Name:</strong> ${customerData.name}</p>
                <p><strong>Email:</strong> ${customerData.email}</p>
                <p><strong>Phone:</strong> ${customerData.phone}</p>
                <p><strong>Date of Birth:</strong> ${customerData.dateOfBirth}</p>
                <p><strong>Aadhar:</strong> ${customerData.aadharNumber}</p>
            </div>
            
            <div class="details">
                <h3>Address</h3>
                <p>${customerData.address}</p>
                <p>${customerData.city}, ${customerData.pincode}</p>
            </div>
            
            <div class="details">
                <h3>Nominee Information</h3>
                <p><strong>Name:</strong> ${customerData.nomineeFullName}</p>
                <p><strong>Relationship:</strong> ${customerData.nomineeRelationship}</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate text content for company email
 */
function generateCompanyTextContent(customerData, policyData) {
    return `
New Policy Created - ${policyData.policyNumber}

Policy Information:
- Policy Number: ${policyData.policyNumber}
- Plan: ${policyData.planName}
- Premium: ₹${policyData.amount}
- Date: ${new Date().toLocaleString()}
- Payment ID: ${policyData.paymentId}

Customer Information:
- Name: ${customerData.name}
- Email: ${customerData.email}
- Phone: ${customerData.phone}
- Date of Birth: ${customerData.dateOfBirth}
- Aadhar: ${customerData.aadharNumber}

Address: ${customerData.address}, ${customerData.city}, ${customerData.pincode}

Nominee: ${customerData.nomineeFullName} (${customerData.nomineeRelationship})
`;
}

module.exports = {
    sendCustomerConfirmationEmail,
    sendCompanyAcknowledgmentEmail,
    sendEmailCampaign
};