// Initialize DynamoDB Document Client
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
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

/**
 * Get all policies from DynamoDB
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of items to return
 * @param {string} options.lastEvaluatedKey - For pagination
 */
async function getAllPolicies(options = {}) {
    if (!TABLE_NAME) {
        throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
    }

    const params = {
        TableName: TABLE_NAME,
        ...(options.limit && { Limit: options.limit }),
        ...(options.lastEvaluatedKey && { ExclusiveStartKey: options.lastEvaluatedKey })
    };

    try {
        const result = await ddbDocClient.send(new ScanCommand(params));
        return {
            items: result.Items || [],
            lastEvaluatedKey: result.LastEvaluatedKey,
            count: result.Count,
            scannedCount: result.ScannedCount
        };
    } catch (error) {
        error.tableName = TABLE_NAME;
        throw error;
    }
}

/**
 * Get policies with date range filter
 * @param {Object} dateRange - Date range filter
 * @param {string} dateRange.startDate - Start date (ISO string)
 * @param {string} dateRange.endDate - End date (ISO string)
 */
async function getPoliciesByDateRange(dateRange) {
    if (!TABLE_NAME) {
        throw new Error('DYNAMODB_TABLE_NAME environment variable is not set');
    }

    const params = {
        TableName: TABLE_NAME,
        FilterExpression: '#timestamp BETWEEN :startDate AND :endDate',
        ExpressionAttributeNames: {
            '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
            ':startDate': dateRange.startDate,
            ':endDate': dateRange.endDate
        }
    };

    try {
        const result = await ddbDocClient.send(new ScanCommand(params));
        return {
            items: result.Items || [],
            count: result.Count,
            scannedCount: result.ScannedCount
        };
    } catch (error) {
        error.tableName = TABLE_NAME;
        throw error;
    }
}

module.exports = { 
    savePolicy, 
    getAllPolicies, 
    getPoliciesByDateRange 
};