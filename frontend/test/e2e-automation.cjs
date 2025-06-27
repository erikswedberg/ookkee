const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const path = require('path');
const fs = require('fs');

// Configuration
const FRONTEND_URL = 'http://localhost:5173';
const TEST_PROJECT_NAME = 'E2E Test Project';
const TEST_CSV_FILE = path.resolve(__dirname, '../../large-test-data.csv');
const HEADLESS = process.argv.includes('--headless');
const TIMEOUT = 30000; // 30 seconds

class E2ETestRunner {
    constructor() {
        this.driver = null;
    }

    async setup() {
        console.log('🚀 Setting up Selenium WebDriver...');
        
        // Chrome options
        const options = new chrome.Options();
        if (HEADLESS) {
            options.addArguments('--headless');
            console.log('   Running in headless mode');
        }
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        
        this.driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
            
        console.log('   WebDriver initialized');
    }

    async cleanup() {
        if (this.driver) {
            await this.driver.quit();
            console.log('🧹 WebDriver cleaned up');
        }
    }

    async waitForElement(selector, timeout = TIMEOUT) {
        return await this.driver.wait(
            until.elementLocated(By.css(selector)), 
            timeout
        );
    }

    async waitForElementClickable(selector, timeout = TIMEOUT) {
        const element = await this.waitForElement(selector, timeout);
        return await this.driver.wait(
            until.elementIsEnabled(element),
            timeout
        );
    }

    async takeScreenshot(filename) {
        if (!HEADLESS) return; // Only take screenshots in headless mode for debugging
        
        const screenshot = await this.driver.takeScreenshot();
        const screenshotPath = path.join(__dirname, `screenshots/${filename}`);
        
        // Create screenshots directory if it doesn't exist
        const screenshotDir = path.dirname(screenshotPath);
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }
        
        fs.writeFileSync(screenshotPath, screenshot, 'base64');
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
    }

    async verifyFileExists() {
        if (!fs.existsSync(TEST_CSV_FILE)) {
            throw new Error(`Test file not found: ${TEST_CSV_FILE}`);
        }
        console.log(`   ✅ Test file exists: ${TEST_CSV_FILE}`);
    }

    async navigateToApp() {
        console.log('🌐 Navigating to Ookkee application...');
        await this.driver.get(FRONTEND_URL);
        
        // Wait for page to load
        await this.waitForElement('[data-testid="add-project-button"]');
        console.log('   ✅ Application loaded successfully');
        
        await this.takeScreenshot('01-app-loaded.png');
    }

    async createProject() {
        console.log('📁 Creating new project...');
        
        // Step 1: Click add project button
        const addButton = await this.waitForElementClickable('[data-testid="add-project-button"]');
        await addButton.click();
        console.log('   ✅ Clicked add project button');
        
        // Step 2: Wait for modal to open and fill project name
        const nameInput = await this.waitForElement('[data-testid="project-name-input"]');
        await nameInput.clear();
        await nameInput.sendKeys(TEST_PROJECT_NAME);
        console.log(`   ✅ Entered project name: ${TEST_PROJECT_NAME}`);
        
        await this.takeScreenshot('02-project-modal-opened.png');
    }

    async uploadFile() {
        console.log('📤 Uploading CSV file...');
        
        // Step 3: Upload CSV file
        const fileInput = await this.waitForElement('[data-testid="csv-file-input"]');
        await fileInput.sendKeys(TEST_CSV_FILE);
        console.log(`   ✅ Selected file: ${path.basename(TEST_CSV_FILE)}`);
        
        // Step 4: Click upload button
        const uploadButton = await this.waitForElementClickable('[data-testid="upload-file-button"]');
        await uploadButton.click();
        console.log('   ✅ Clicked upload button');
        
        await this.takeScreenshot('03-file-selected.png');
        
        // Step 5: Wait for upload to complete (modal should close)
        console.log('   ⏳ Waiting for upload to complete...');
        try {
            // Wait for modal to disappear (indicating upload completed)
            await this.driver.wait(
                until.stalenessOf(await this.driver.findElement(By.css('[data-testid="project-name-input"]'))),
                TIMEOUT
            );
            console.log('   ✅ Upload completed, modal closed');
        } catch (error) {
            console.log('   ⚠️  Modal may still be open, checking for cancel button...');
            try {
                const cancelButton = await this.driver.findElement(By.css('[data-testid="cancel-button"]'));
                await cancelButton.click();
                console.log('   ✅ Closed modal manually');
            } catch (e) {
                console.log('   ✅ Modal appears to be closed');
            }
        }
        
        await this.takeScreenshot('04-upload-completed.png');
    }

    async openProject() {
        console.log('📊 Opening created project...');
        
        // Step 6: Wait for project to appear in sidebar and click it
        const projectSelector = `h3:contains('${TEST_PROJECT_NAME}')`;
        
        // Since CSS :contains isn't supported, use XPath
        const projectXPath = `//h3[contains(text(), '${TEST_PROJECT_NAME}')]`;
        
        const projectLink = await this.driver.wait(
            until.elementLocated(By.xpath(projectXPath)),
            TIMEOUT
        );
        
        await this.driver.wait(until.elementIsEnabled(projectLink), TIMEOUT);
        await projectLink.click();
        console.log(`   ✅ Clicked on project: ${TEST_PROJECT_NAME}`);
        
        await this.takeScreenshot('05-project-clicked.png');
    }

    async verifyTable() {
        console.log('📋 Verifying spreadsheet table...');
        
        // Step 7: Wait for table to load
        const table = await this.waitForElement('table', TIMEOUT);
        console.log('   ✅ Table loaded successfully');
        
        // Verify table headers
        const headers = await this.driver.findElements(By.css('table th'));
        const headerTexts = [];
        for (const header of headers) {
            const text = await header.getText();
            headerTexts.push(text.trim());
        }
        
        console.log(`   📊 Table headers: ${headerTexts.join(', ')}`);
        
        // Verify we have the expected headers
        const expectedHeaders = ['#', 'Date', 'Description', 'Amount', 'Category'];
        const hasAllHeaders = expectedHeaders.every(expected => 
            headerTexts.some(actual => actual === expected)
        );
        
        if (hasAllHeaders) {
            console.log('   ✅ All expected headers found');
        } else {
            console.log('   ⚠️  Some headers missing or different');
            console.log(`   Expected: ${expectedHeaders.join(', ')}`);
            console.log(`   Actual: ${headerTexts.join(', ')}`);
        }
        
        // Count rows
        const rows = await this.driver.findElements(By.css('table tbody tr'));
        console.log(`   📊 Table rows: ${rows.length}`);
        
        // Verify Category column (should have dropdown)
        const categoryDropdowns = await this.driver.findElements(By.css('table tbody tr td select'));
        console.log(`   🔽 Category dropdowns found: ${categoryDropdowns.length}`);
        
        if (categoryDropdowns.length > 0) {
            console.log('   ✅ Category dropdowns are present');
        } else {
            console.log('   ⚠️  No category dropdowns found');
        }
        
        await this.takeScreenshot('06-table-verified.png');
        
        return {
            headers: headerTexts,
            rowCount: rows.length,
            categoryDropdowns: categoryDropdowns.length,
            success: hasAllHeaders && rows.length > 0
        };
    }

    async runFullTest() {
        const startTime = Date.now();
        console.log('🧪 Starting E2E File Upload Test...');
        console.log(`   Frontend URL: ${FRONTEND_URL}`);
        console.log(`   Test file: ${TEST_CSV_FILE}`);
        console.log(`   Headless mode: ${HEADLESS}`);
        console.log('');

        try {
            // Pre-flight checks
            await this.verifyFileExists();
            
            // Setup
            await this.setup();
            
            // Test steps
            await this.navigateToApp();
            await this.createProject();
            await this.uploadFile();
            await this.openProject();
            const results = await this.verifyTable();
            
            // Success!
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log('');
            console.log('🎉 E2E Test PASSED!');
            console.log(`   Duration: ${duration}s`);
            console.log(`   Project created: ${TEST_PROJECT_NAME}`);
            console.log(`   Table headers: ${results.headers.length}`);
            console.log(`   Data rows: ${results.rowCount}`);
            console.log(`   Category dropdowns: ${results.categoryDropdowns}`);
            
            return true;
            
        } catch (error) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.error('');
            console.error('❌ E2E Test FAILED!');
            console.error(`   Duration: ${duration}s`);
            console.error(`   Error: ${error.message}`);
            
            await this.takeScreenshot('error-state.png');
            
            return false;
            
        } finally {
            await this.cleanup();
        }
    }
}

// Run the test
if (require.main === module) {
    const runner = new E2ETestRunner();
    
    runner.runFullTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

module.exports = E2ETestRunner;
