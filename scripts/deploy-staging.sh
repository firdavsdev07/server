#!/bin/bash

###############################################################################
# Staging Deployment Script
# 
# This script handles deployment to staging environment including:
# - Pre-deployment checks
# - Database backup
# - Migration execution
# - Smoke tests
# - Rollback on failure
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STAGING_ENV="${STAGING_ENV:-.env.staging}"
BACKUP_DIR="./backups/staging"
LOG_FILE="./logs/deploy-staging-$(date +%Y%m%d-%H%M%S).log"
SMOKE_TEST_TIMEOUT=30

# Create necessary directories
mkdir -p "$BACKUP_DIR"
mkdir -p "./logs"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

# Error handler
error_handler() {
    log_error "Deployment failed at line $1"
    log_warning "Starting rollback procedure..."
    rollback
    exit 1
}

trap 'error_handler $LINENO' ERR

###############################################################################
# Pre-deployment Checks
###############################################################################

pre_deployment_checks() {
    log "🔍 Running pre-deployment checks..."
    
    # Check if staging environment file exists
    if [ ! -f "$STAGING_ENV" ]; then
        log_error "Staging environment file not found: $STAGING_ENV"
        exit 1
    fi
    
    # Load staging environment
    export $(cat "$STAGING_ENV" | grep -v '^#' | xargs)
    
    # Check MongoDB connection
    log "Checking MongoDB connection..."
    if ! node -e "const mongoose = require('mongoose'); mongoose.connect('$MONGO_URI').then(() => { console.log('Connected'); process.exit(0); }).catch(() => process.exit(1));"; then
        log_error "Cannot connect to MongoDB"
        exit 1
    fi
    log_success "MongoDB connection successful"
    
    # Check if build is successful
    log "Running build..."
    if ! npm run build > /dev/null 2>&1; then
        log_error "Build failed"
        exit 1
    fi
    log_success "Build successful"
    
    # Check disk space
    AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}' | sed 's/G//')
    if (( $(echo "$AVAILABLE_SPACE < 1" | bc -l) )); then
        log_error "Insufficient disk space: ${AVAILABLE_SPACE}GB available"
        exit 1
    fi
    log_success "Disk space check passed: ${AVAILABLE_SPACE}GB available"
    
    log_success "All pre-deployment checks passed"
}

###############################################################################
# Database Backup
###############################################################################

backup_database() {
    log "💾 Creating database backup..."
    
    BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).gz"
    
    # Extract database name from MONGO_URI
    DB_NAME=$(echo "$MONGO_URI" | sed 's/.*\/\([^?]*\).*/\1/')
    
    # Create backup using mongodump
    if command -v mongodump &> /dev/null; then
        mongodump --uri="$MONGO_URI" --archive="$BACKUP_FILE" --gzip
        log_success "Database backup created: $BACKUP_FILE"
        echo "$BACKUP_FILE" > "$BACKUP_DIR/latest-backup.txt"
    else
        log_warning "mongodump not found, skipping database backup"
        log_warning "Please ensure you have a backup before proceeding"
        read -p "Continue without backup? (yes/no): " -n 3 -r
        echo
        if [[ ! $REPLY =~ ^yes$ ]]; then
            log_error "Deployment cancelled by user"
            exit 1
        fi
    fi
}

###############################################################################
# Run Migrations
###############################################################################

run_migrations() {
    log "🔄 Running database migrations..."
    
    # Run migrations
    if npm run migrate:up; then
        log_success "Migrations completed successfully"
    else
        log_error "Migration failed"
        return 1
    fi
}

###############################################################################
# Deploy Application
###############################################################################

deploy_application() {
    log "🚀 Deploying application..."
    
    # Stop existing process (if using PM2 or similar)
    if command -v pm2 &> /dev/null; then
        log "Stopping existing application..."
        pm2 stop staging-server || true
        pm2 delete staging-server || true
    fi
    
    # Install dependencies
    log "Installing dependencies..."
    npm ci --production
    
    # Build application
    log "Building application..."
    npm run build
    
    # Start application (if using PM2)
    if command -v pm2 &> /dev/null; then
        log "Starting application with PM2..."
        pm2 start dist/server.js --name staging-server --env staging
        pm2 save
        log_success "Application started with PM2"
    else
        log_warning "PM2 not found, please start the application manually"
    fi
    
    log_success "Application deployed successfully"
}

###############################################################################
# Smoke Tests
###############################################################################

run_smoke_tests() {
    log "🧪 Running smoke tests..."
    
    # Wait for application to start
    log "Waiting for application to start..."
    sleep 5
    
    # Get application URL from environment
    APP_URL="${STAGING_URL:-http://localhost:5000}"
    
    # Test 1: Health check
    log "Test 1: Health check endpoint..."
    if curl -f -s -m $SMOKE_TEST_TIMEOUT "$APP_URL/health" > /dev/null 2>&1; then
        log_success "Health check passed"
    else
        log_error "Health check failed"
        return 1
    fi
    
    # Test 2: API endpoint
    log "Test 2: API endpoint check..."
    if curl -f -s -m $SMOKE_TEST_TIMEOUT "$APP_URL/api" > /dev/null 2>&1; then
        log_success "API endpoint check passed"
    else
        log_warning "API endpoint check failed (may be expected if auth required)"
    fi
    
    # Test 3: Database connection
    log "Test 3: Database connection check..."
    if node -e "const mongoose = require('mongoose'); mongoose.connect('$MONGO_URI').then(() => { console.log('OK'); process.exit(0); }).catch(() => process.exit(1));" > /dev/null 2>&1; then
        log_success "Database connection check passed"
    else
        log_error "Database connection check failed"
        return 1
    fi
    
    log_success "All smoke tests passed"
}

###############################################################################
# Rollback
###############################################################################

rollback() {
    log_warning "🔙 Starting rollback..."
    
    # Restore database from backup
    if [ -f "$BACKUP_DIR/latest-backup.txt" ]; then
        LATEST_BACKUP=$(cat "$BACKUP_DIR/latest-backup.txt")
        if [ -f "$LATEST_BACKUP" ]; then
            log "Restoring database from backup: $LATEST_BACKUP"
            
            if command -v mongorestore &> /dev/null; then
                mongorestore --uri="$MONGO_URI" --archive="$LATEST_BACKUP" --gzip --drop
                log_success "Database restored from backup"
            else
                log_error "mongorestore not found, cannot restore database"
            fi
        fi
    else
        log_warning "No backup found for rollback"
    fi
    
    # Rollback migrations
    log "Rolling back migrations..."
    npm run migrate:down || log_warning "Migration rollback failed"
    
    log_warning "Rollback completed"
}

###############################################################################
# UAT Preparation
###############################################################################

prepare_uat() {
    log "📋 Preparing for UAT (User Acceptance Testing)..."
    
    # Create UAT checklist
    cat > "./logs/uat-checklist-$(date +%Y%m%d-%H%M%S).md" << EOF
# UAT Checklist - Contract Payment Edit Feature

## Date: $(date +'%Y-%m-%d %H:%M:%S')
## Environment: Staging

### Test Scenarios

#### 1. Contract Edit - Monthly Payment Increase
- [ ] Login as admin
- [ ] Navigate to contract with paid monthly payments
- [ ] Edit contract and increase monthly payment by 20%
- [ ] Verify impact summary shows UNDERPAID payments
- [ ] Confirm edit
- [ ] Verify additional payments are created
- [ ] Check payment history shows correct status badges
- [ ] Verify notes are updated correctly

#### 2. Contract Edit - Monthly Payment Decrease
- [ ] Login as admin
- [ ] Navigate to contract with paid monthly payments
- [ ] Edit contract and decrease monthly payment by 20%
- [ ] Verify impact summary shows OVERPAID payments
- [ ] Confirm edit
- [ ] Verify excess amounts are applied to future payments
- [ ] Check cascade logic works correctly
- [ ] Verify prepaid balance is updated

#### 3. Contract Edit - Initial Payment Change
- [ ] Login as admin
- [ ] Edit contract initial payment
- [ ] Verify payment document is updated
- [ ] Verify manager balance is updated correctly
- [ ] Check notes reflect the change

#### 4. Contract Edit - Total Price Change
- [ ] Login as admin
- [ ] Edit contract total price
- [ ] Verify contract status is recalculated
- [ ] Check remaining debt is updated

#### 5. Edit History
- [ ] View contract edit history
- [ ] Verify all changes are recorded
- [ ] Check affected payments are listed
- [ ] Verify impact summary is displayed

#### 6. Validation
- [ ] Try to set negative monthly payment (should fail)
- [ ] Try to change monthly payment by >50% (should fail)
- [ ] Try to set total price < initial payment (should fail)
- [ ] Verify validation error messages are clear

#### 7. Dashboard Alerts
- [ ] Check dashboard shows contract edit alerts
- [ ] Verify alert contains correct information
- [ ] Test quick action buttons

### Performance Tests
- [ ] Edit contract with 50+ payments (should complete in <5 seconds)
- [ ] Edit multiple contracts simultaneously
- [ ] Check database query performance

### Security Tests
- [ ] Try to edit contract as non-admin user (should fail)
- [ ] Verify authorization checks work correctly
- [ ] Check audit trail is maintained

### Notes
_Add any issues or observations here_

---

## Sign-off

- [ ] All tests passed
- [ ] Issues documented and resolved
- [ ] Ready for production deployment

**Tested by:** _______________
**Date:** _______________
**Signature:** _______________
EOF
    
    log_success "UAT checklist created: ./logs/uat-checklist-$(date +%Y%m%d-%H%M%S).md"
    
    # Create test data script
    log "Creating test data generation script..."
    cat > "./scripts/generate-test-data.js" << 'EOF'
/**
 * Generate Test Data for UAT
 * 
 * This script creates test contracts and payments for UAT testing
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.staging' });

async function generateTestData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        
        // Import schemas
        const Contract = require('../dist/schemas/contract.schema').default;
        const Payment = require('../dist/schemas/payment.schema').default;
        const Customer = require('../dist/schemas/customer.schema').default;
        const Notes = require('../dist/schemas/notes.schema').default;
        
        console.log('📝 Creating test customer...');
        const testCustomer = await Customer.create({
            firstName: 'UAT',
            lastName: 'Test User',
            phoneNumber: '+998901234567',
            address: 'Test Address',
            passportNumber: 'AA1234567',
            isActive: true
        });
        
        console.log('📝 Creating test contract...');
        const notes = await Notes.create({
            text: 'UAT test contract',
            customer: testCustomer._id
        });
        
        const contract = await Contract.create({
            customer: testCustomer._id,
            productName: 'iPhone 15 Pro (UAT Test)',
            originalPrice: 1200,
            price: 1200,
            initialPayment: 300,
            percentage: 25,
            period: 12,
            monthlyPayment: 100,
            totalPrice: 1500,
            startDate: new Date(),
            initialPaymentDueDate: new Date(),
            nextPaymentDate: new Date(),
            status: 'ACTIVE',
            payments: [],
            notes: notes._id,
            isDeclare: false,
            isActive: true,
            isDeleted: false
        });
        
        console.log('📝 Creating test payments...');
        // Create initial payment
        const initialPayment = await Payment.create({
            amount: 300,
            date: new Date(),
            isPaid: true,
            paymentType: 'initial',
            customerId: testCustomer._id,
            status: 'PAID',
            expectedAmount: 300,
            notes: notes._id
        });
        
        contract.payments.push(initialPayment._id);
        
        // Create 3 paid monthly payments
        for (let i = 1; i <= 3; i++) {
            const paymentDate = new Date();
            paymentDate.setMonth(paymentDate.getMonth() - (3 - i));
            
            const monthlyPayment = await Payment.create({
                amount: 100,
                date: paymentDate,
                isPaid: true,
                paymentType: 'monthly',
                customerId: testCustomer._id,
                status: 'PAID',
                expectedAmount: 100,
                notes: notes._id
            });
            
            contract.payments.push(monthlyPayment._id);
        }
        
        await contract.save();
        
        console.log('✅ Test data created successfully!');
        console.log(`   Contract ID: ${contract._id}`);
        console.log(`   Customer ID: ${testCustomer._id}`);
        console.log(`   Payments: ${contract.payments.length}`);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error generating test data:', error);
        process.exit(1);
    }
}

generateTestData();
EOF
    
    log_success "Test data generation script created"
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    log "🚀 =========================================="
    log "🚀 Starting Staging Deployment"
    log "🚀 =========================================="
    log ""
    
    # Step 1: Pre-deployment checks
    pre_deployment_checks
    log ""
    
    # Step 2: Database backup
    backup_database
    log ""
    
    # Step 3: Run migrations
    run_migrations
    log ""
    
    # Step 4: Deploy application
    deploy_application
    log ""
    
    # Step 5: Run smoke tests
    run_smoke_tests
    log ""
    
    # Step 6: Prepare for UAT
    prepare_uat
    log ""
    
    log_success "=========================================="
    log_success "🎉 Staging Deployment Completed Successfully!"
    log_success "=========================================="
    log ""
    log "📋 Next Steps:"
    log "   1. Review UAT checklist: ./logs/uat-checklist-*.md"
    log "   2. Generate test data: node ./scripts/generate-test-data.js"
    log "   3. Perform UAT testing"
    log "   4. Document any issues"
    log "   5. Proceed to production deployment when ready"
    log ""
    log "📝 Deployment log saved to: $LOG_FILE"
}

# Run main deployment
main
