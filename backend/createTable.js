/**
 * Script to create DynamoDB table for policies
 * Run with: node createTable.js
 */
const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config();

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

async function createTable() {
    const params = {
        TableName: process.env.DYNAMODB_TABLE_NAME,
        KeySchema: [
            { AttributeName: 'policyId', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
            { AttributeName: 'policyId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
    };

    try {
        const data = await client.send(new CreateTableCommand(params));
        console.log('Table created:', data);
    } catch (err) {
        console.error('Error creating table:', err);
    }
}

createTable();
