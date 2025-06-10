// Initialize DynamoDB Document Client
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

/**
 * Save a policy item to DynamoDB
 * @param {{ policyId: string, orderId: string, paymentId: string, userData: object, timestamp: string }} policy
 */
async function savePolicy(policy) {
    if (!TABLE_NAME) {
        throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
    }

    const params = {
        TableName: TABLE_NAME,
        Item: policy,
        // Prevent overwriting existing policies
        ConditionExpression: 'attribute_not_exists(policyId)'
    };

    try {
        const result = await ddbDocClient.send(new PutCommand(params));
        return result;
    } catch (error) {
        // Add more context to the error
        error.tableName = TABLE_NAME;
        error.policyId = policy.policyId;
        throw error;
    }
}

module.exports = { savePolicy };