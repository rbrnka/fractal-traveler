/**
 * Deployment module for test and prod locations
 * @author Radim Brnka
 * @module FtpDeploy
 * @requires ftp-deploy
 */

const FtpDeploy = require('ftp-deploy');
const path = require('path');
require('dotenv').config();

const ftpDeploy = new FtpDeploy();

// Check if deploying to test or production
const isTest = process.argv.includes('--test');
const environment = isTest ? 'TEST' : 'PRODUCTION';

// Configuration for main dist deployment
const configFtp = {
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    host: process.env.FTP_HOST,
    port: process.env.FTP_PORT || 21,
    localRoot: path.join(__dirname, 'dist'),
    remoteRoot: isTest ? process.env.FTP_REMOTE_TEST_ROOT : process.env.FTP_REMOTE_ROOT,
    include: ['*', '**/*'],
    exclude: ['*.map'],
};

// Configuration for docs deployment
const configFtpDocs = {
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    host: process.env.FTP_HOST,
    port: process.env.FTP_PORT || 21,
    localRoot: path.join(__dirname, 'doc'),
    remoteRoot: isTest ? process.env.FTP_REMOTE_TEST_DOC_ROOT : process.env.FTP_REMOTE_DOC_ROOT,
    include: ['*', '**/*']
};

async function deploy() {
    try {
        console.log(`\n🚀 Deploying to ${environment} environment via FTP...`);
        console.log(`📂 Target: ${configFtp.remoteRoot}\n`);

        console.log('📦 Deploying dist...');
        await ftpDeploy.deploy(configFtp);
        console.log('✅ Dist deployed successfully!');

        if (!isTest) {
            console.log('\n📚 Deploying docs...');
            await ftpDeploy.deploy(configFtpDocs);
            console.log('✅ Docs deployed successfully!');
        }

        console.log(`\n🎉 All deployments to ${environment} completed successfully!\n`);
    } catch (err) {
        console.error('❌ FTP Deploy Error:', err);
        process.exit(1);
    }
}

deploy();
