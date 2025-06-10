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
    const params = {
        TableName: TABLE_NAME,
        Item: policy
    };
    return ddbDocClient.send(new PutCommand(params));
}

module.exports = { savePolicy };