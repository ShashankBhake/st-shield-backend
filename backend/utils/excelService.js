const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('./logger');
const { getAllPolicies, getPoliciesByDateRange } = require('../models/Policy');

/**
 * Export policies to Excel file
 * @param {Object} options - Export options
 * @param {string} options.format - Export format ('xlsx' or 'csv')
 * @param {Object} options.dateRange - Date range filter
 * @param {boolean} options.includeUserData - Whether to include detailed user data
 */
async function exportPoliciesToExcel(options = {}) {
    try {
        const { format = 'xlsx', dateRange, includeUserData = true } = options;
        
        // Get policies from database
        let policies;
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            policies = await getPoliciesByDateRange(dateRange);
        } else {
            policies = await getAllPolicies();
        }

        if (!policies.items || policies.items.length === 0) {
            throw new Error('No policies found for export');
        }

        // Transform data for Excel
        const excelData = transformPoliciesForExcel(policies.items, includeUserData);
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        
        // Create main policies worksheet
        const policiesWS = XLSX.utils.json_to_sheet(excelData.policies);
        XLSX.utils.book_append_sheet(workbook, policiesWS, 'Policies');
        
        // Create summary worksheet
        const summaryWS = XLSX.utils.json_to_sheet(excelData.summary);
        XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `policies_export_${timestamp}.${format}`;
        const filePath = path.join(__dirname, '../../exports', filename);

        // Ensure exports directory exists
        await ensureExportsDirectory();

        // Write file
        if (format === 'csv') {
            const csv = XLSX.utils.sheet_to_csv(policiesWS);
            await fs.writeFile(filePath.replace('.csv', '_policies.csv'), csv);
        } else {
            XLSX.writeFile(workbook, filePath);
        }

        logger.info('Policies exported successfully', {
            filename,
            totalPolicies: policies.items.length,
            format,
            dateRange
        });

        return {
            success: true,
            filename,
            filePath,
            totalRecords: policies.items.length,
            exportTime: new Date().toISOString()
        };

    } catch (error) {
        logger.error('Failed to export policies to Excel', {
            error: error.message,
            stack: error.stack,
            options
        });
        throw error;
    }
}

/**
 * Export policies to an external Excel file at a specified location
 * @param {Object} options - Export options
 * @param {string} options.filePath - External path to save the Excel file
 * @param {Object} options.dateRange - Optional date range filter
 * @param {boolean} options.includeUserData - Whether to include detailed user data
 */
async function exportPoliciesToExternalFile(options = {}) {
    try {
        const { filePath, dateRange, includeUserData = true } = options;
        
        if (!filePath) {
            throw new Error('External file path is required');
        }
        
        // Get policies from database
        let policies;
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            policies = await getPoliciesByDateRange(dateRange);
        } else {
            policies = await getAllPolicies();
        }

        if (!policies.items || policies.items.length === 0) {
            logger.warn('No policies found for external export');
            return {
                success: false,
                message: 'No policies found for export',
                exportTime: new Date().toISOString()
            };
        }

        // Transform data for Excel
        const excelData = transformPoliciesForExcel(policies.items, includeUserData);
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        
        // Create main policies worksheet
        const policiesWS = XLSX.utils.json_to_sheet(excelData.policies);
        XLSX.utils.book_append_sheet(workbook, policiesWS, 'Policies');
        
        // Create summary worksheet
        const summaryWS = XLSX.utils.json_to_sheet(excelData.summary);
        XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

        // Add auto-update timestamp
        const timestampWS = XLSX.utils.json_to_sheet([{
            'Last Updated': new Date().toLocaleString(),
            'Total Records': policies.items.length
        }]);
        XLSX.utils.book_append_sheet(workbook, timestampWS, 'Metadata');

        // Write file
        XLSX.writeFile(workbook, filePath);

        logger.info('Policies exported to external file successfully', {
            filePath,
            totalPolicies: policies.items.length,
            dateRange
        });

        return {
            success: true,
            filePath,
            totalRecords: policies.items.length,
            exportTime: new Date().toISOString()
        };

    } catch (error) {
        logger.error('Failed to export policies to external file', {
            error: error.message,
            stack: error.stack,
            options
        });
        throw error;
    }
}

/**
 * Transform policies data for Excel export
 * @param {Array} policies - Raw policies from database
 * @param {boolean} includeUserData - Include detailed user data
 */
function transformPoliciesForExcel(policies, includeUserData = true) {
    const transformedPolicies = policies.map(policy => {
        const userData = policy.userData || {};
        
        const baseData = {
            'Policy ID': policy.policyId,
            'Order ID': policy.orderId,
            'Payment ID': policy.paymentId,
            'Created Date': new Date(policy.timestamp).toLocaleString(),
            'Policy Status': 'Active'
        };

        if (includeUserData) {
            return {
                ...baseData,
                'Customer Name': userData.name || 'N/A',
                'Email': userData.email || 'N/A',
                'Phone': userData.phone || 'N/A',
                'Date of Birth': userData.dateOfBirth || 'N/A',
                'Aadhar Number': userData.aadharNumber || 'N/A',
                'Plan Type': userData.planType || 'N/A',
                'Amount': userData.amount || 'N/A',
                'Address': userData.address || 'N/A',
                'City': userData.city || 'N/A',
                'Pincode': userData.pincode || 'N/A',
                'Nominee Name': userData.nomineeFullName || 'N/A',
                'Nominee Relationship': userData.nomineeRelationship || 'N/A',
                'Parent Name': userData.parentName || 'N/A',
                'Parent Phone': userData.parentPhone || 'N/A',
                'College Name': userData.collegeName || 'N/A',
                'Course': userData.course || 'N/A',
                'Year of Study': userData.yearOfStudy || 'N/A'
            };
        }

        return baseData;
    });

    // Generate summary data
    const summary = generateSummaryData(policies);

    return {
        policies: transformedPolicies,
        summary
    };
}

/**
 * Generate summary statistics
 * @param {Array} policies - Raw policies from database
 */
function generateSummaryData(policies) {
    const planTypes = {};
    const cityCounts = {};
    let totalAmount = 0;
    let totalPolicies = policies.length;

    policies.forEach(policy => {
        const userData = policy.userData || {};
        
        // Plan type statistics
        const planType = userData.planType || 'Unknown';
        planTypes[planType] = (planTypes[planType] || 0) + 1;
        
        // City statistics
        const city = userData.city || 'Unknown';
        cityCounts[city] = (cityCounts[city] || 0) + 1;
        
        // Total amount
        const amount = parseFloat(userData.amount) || 0;
        totalAmount += amount;
    });

    const summaryData = [
        { Metric: 'Total Policies', Value: totalPolicies },
        { Metric: 'Total Premium Amount', Value: `₹${totalAmount.toLocaleString()}` },
        { Metric: 'Average Premium', Value: `₹${Math.round(totalAmount / totalPolicies).toLocaleString()}` },
        { Metric: 'Export Date', Value: new Date().toLocaleString() },
        { Metric: '', Value: '' }, // Empty row
        { Metric: 'Plan Distribution', Value: '' }
    ];

    // Add plan type distribution
    Object.entries(planTypes).forEach(([plan, count]) => {
        summaryData.push({
            Metric: `${plan} Plans`,
            Value: `${count} (${Math.round((count / totalPolicies) * 100)}%)`
        });
    });

    summaryData.push({ Metric: '', Value: '' }); // Empty row
    summaryData.push({ Metric: 'Top Cities', Value: '' });

    // Add top 5 cities
    Object.entries(cityCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([city, count]) => {
            summaryData.push({
                Metric: city,
                Value: `${count} policies`
            });
        });

    return summaryData;
}

/**
 * Ensure exports directory exists
 */
async function ensureExportsDirectory() {
    const exportsDir = path.join(__dirname, '../../exports');
    try {
        await fs.access(exportsDir);
    } catch (error) {
        await fs.mkdir(exportsDir, { recursive: true });
        logger.info('Created exports directory', { path: exportsDir });
    }
}

/**
 * Get list of exported files
 */
async function getExportedFiles() {
    try {
        const exportsDir = path.join(__dirname, '../../exports');
        await ensureExportsDirectory();
        
        const files = await fs.readdir(exportsDir);
        const fileDetails = await Promise.all(
            files.map(async (filename) => {
                const filePath = path.join(exportsDir, filename);
                const stats = await fs.stat(filePath);
                return {
                    filename,
                    filePath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
        );

        return fileDetails.sort((a, b) => b.created - a.created);
    } catch (error) {
        logger.error('Failed to get exported files list', { error: error.message });
        throw error;
    }
}

/**
 * Delete an exported file
 * @param {string} filename - Name of file to delete
 */
async function deleteExportedFile(filename) {
    try {
        const filePath = path.join(__dirname, '../../exports', filename);
        await fs.unlink(filePath);
        
        logger.info('Exported file deleted', { filename });
        return { success: true, filename };
    } catch (error) {
        logger.error('Failed to delete exported file', { 
            filename, 
            error: error.message 
        });
        throw error;
    }
}

module.exports = {
    exportPoliciesToExcel,
    exportPoliciesToExternalFile,
    getExportedFiles,
    deleteExportedFile,
    transformPoliciesForExcel,
    generateSummaryData
};