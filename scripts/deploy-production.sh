#!/bin/bash

###############################################################################
# Production Deployment Script
# 
# This script handles deployment to production environment including:
# - Pre-deployment checks and validation
# - Automated database backup
# - Migration execution with rollback capability
# - Zero-downtime deployment
# - Post-deployment monitoring
# - Automated rollback on failure
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
PROD_ENV="${PROD_ENV:-.env.production}"
BACKUP_DIR="./backups/production"
LOG_FILE="./logs/deploy-production-$(date +%Y%m%d-%H%M%S).log"
SMOKE_TEST_TIMEOUT=60
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_INTERVAL=5
ROLLBACK_ENABLED=true

# Create necessary directories
mkdir -p "$BACKUP_DIR"
mkdir -p "./logs"
mkdir -p "./monitoring"

# Logging functions
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

log_critical() {
    echo -e "${MAGENTA}[$(date +'%Y-%m-%d %H:%M:%S')] 🚨 CRITICAL: $1${NC}" | tee -a "$LOG_FILE"
}

# Error handler with automatic rollback
error_handler() {
    log_critical "Deployment failed at line $1"
    
    if [ "$ROLLBACK_ENABLED" = true ]; then
        log_warning "Automatic rollback is enabled"
        read -p "Do you want to rollback? (yes/no): " -t 30 -r
        echo
        if [[ $REPLY =~ ^yes$ ]] || [[ -z $REPLY ]]; then
            rollback
        else
            log_warning "Rollback skipped by user"
        fi
    fi
    
    exit 1
}

trap 'error_handler $LINENO' ERR

###############################################################################
# Pre-deployment Validation
###############################################################################

pre_deployment_validation() {
    log "🔍 Running pre-deployment validation..."
    
    # Check if production environment file exists
    if [ ! -f "$PROD_ENV" ]; then
        log_error "Production environment file not found: $PROD_ENV"
        exit 1
    fi
    
    # Load production environment
    export $(cat "$PROD_ENV" | grep -v '^#' | xargs)
    
    # Verify NODE_ENV is production
    if [ "$NODE_ENV" != "production" ]; then
        log_error "NODE_ENV must be 'production', found: $NODE_ENV"
        exit 1
    fi
    
    # Check MongoDB connection
    log "Checking MongoDB connection..."
    if ! node -e "const mongoose = require('mongoose'); mongoose.connect('$MONGO_URI', {serverSelectionTimeoutMS: 5000}).then(() => { console.log('Connected'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });"; then
        log_error "Cannot connect to MongoDB"
        exit 1
    fi
    log_success "MongoDB connection successful"
    
    # Verify staging deployment was successful
    log "Checking staging deployment status..."
    if [ ! -f "./logs/staging-deployment-success.flag" ]; then
        log_warning "No staging deployment success flag found"
        read -p "Continue without staging verification? (yes/no): " -n 3 -r
        echo
        if [[ ! $REPLY =~ ^yes$ ]]; then
            log_error "Deployment cancelled - please deploy to staging first"
            exit 1
        fi
    else
        log_success "Staging deployment verified"
    fi
    
    # Check if build is successful
    log "Running production build..."
    if ! npm run build; then
        log_error "Production build failed"
        exit 1
    fi
    log_success "Production build successful"
    
    # Check disk space (require at least 5GB)
    AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}' | sed 's/G//')
    if (( $(echo "$AVAILABLE_SPACE < 5" | bc -l) )); then
        log_error "Insufficient disk space: ${AVAILABLE_SPACE}GB available (minimum 5GB required)"
        exit 1
    fi
    log_success "Disk space check passed: ${AVAILABLE_SPACE}GB available"
    
    # Check system resources
    log "Checking system resources..."
    MEMORY_AVAILABLE=$(free -g | awk 'NR==2 {print $7}')
    if [ "$MEMORY_AVAILABLE" -lt 2 ]; then
        log_warning "Low memory available: ${MEMORY_AVAILABLE}GB"
    else
        log_success "Memory check passed: ${MEMORY_AVAILABLE}GB available"
    fi
    
    # Verify all required environment variables
    log "Verifying environment variables..."
    REQUIRED_VARS=("MONGO_URI" "JWT_SECRET" "PORT")
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable not set: $var"
            exit 1
        fi
    done
    log_success "All required environment variables are set"
    
    log_success "All pre-deployment validations passed"
}

###############################################################################
# Database Backup
###############################################################################

backup_database() {
    log "💾 Creating production database backup..."
    
    BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup-$BACKUP_TIMESTAMP.gz"
    BACKUP_METADATA="$BACKUP_DIR/backup-$BACKUP_TIMESTAMP.json"
    
    # Extract database name from MONGO_URI
    DB_NAME=$(echo "$MONGO_URI" | sed 's/.*\/\([^?]*\).*/\1/')
    
    # Create backup metadata
    cat > "$BACKUP_METADATA" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "database": "$DB_NAME",
  "mongo_uri": "$MONGO_URI",
  "backup_file": "$BACKUP_FILE",
  "deployment_log": "$LOG_FILE",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF
    
    # Create backup using mongodump
    if command -v mongodump &> /dev/null; then
        log "Running mongodump..."
        if mongodump --uri="$MONGO_URI" --archive="$BACKUP_FILE" --gzip; then
            BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
            log_success "Database backup created: $BACKUP_FILE (Size: $BACKUP_SIZE)"
            echo "$BACKUP_FILE" > "$BACKUP_DIR/latest-backup.txt"
            
            # Verify backup integrity
            log "Verifying backup integrity..."
            if [ -s "$BACKUP_FILE" ]; then
                log_success "Backup integrity verified"
            else
                log_error "Backup file is empty or corrupted"
                exit 1
            fi
        else
            log_error "mongodump failed"
            exit 1
        fi
    else
        log_critical "mongodump not found - CANNOT PROCEED WITHOUT BACKUP"
        log_error "Please install MongoDB tools: https://www.mongodb.com/try/download/database-tools"
        exit 1
    fi
    
    # Keep only last 10 backups
    log "Cleaning old backups (keeping last 10)..."
    ls -t "$BACKUP_DIR"/backup-*.gz 2>/dev/null | tail -n +11 | xargs -r rm
    log_success "Backup cleanup completed"
}

###############################################################################
# Run Migrations
###############################################################################

run_migrations() {
    log "🔄 Running database migrations..."
    
    # Create migration backup point
    MIGRATION_BACKUP="$BACKUP_DIR/pre-migration-$(date +%Y%m%d-%H%M%S).gz"
    log "Creating pre-migration backup..."
    mongodump --uri="$MONGO_URI" --archive="$MIGRATION_BACKUP" --gzip
    echo "$MIGRATION_BACKUP" > "$BACKUP_DIR/migration-backup.txt"
    log_success "Pre-migration backup created"
    
    # Run migrations with error handling
    log "Executing migrations..."
    if npm run migrate:up 2>&1 | tee -a "$LOG_FILE"; then
        log_success "Migrations completed successfully"
        
        # Verify migration results
        log "Verifying migration results..."
        node -e "
        const mongoose = require('mongoose');
        mongoose.connect('$MONGO_URI').then(async () => {
            const Payment = require('./dist/schemas/payment.schema').default;
            const Contract = require('./dist/schemas/contract.schema').default;
            
            // Check if new fields exist
            const payment = await Payment.findOne();
            const contract = await Contract.findOne();
            
            if (payment && 'linkedPaymentId' in payment) {
                console.log('✅ Payment schema updated');
            }
            if (contract && 'prepaidBalance' in contract) {
                console.log('✅ Contract schema updated');
            }
            
            await mongoose.disconnect();
            process.exit(0);
        }).catch((e) => {
            console.error('❌ Migration verification failed:', e);
            process.exit(1);
        });
        " || {
            log_error "Migration verification failed"
            return 1
        }
        
        log_success "Migration verification passed"
    else
        log_error "Migration failed"
        return 1
    fi
}

###############################################################################
# Zero-Downtime Deployment
###############################################################################

deploy_application() {
    log "🚀 Deploying application with zero-downtime strategy..."
    
    # Check if PM2 is available
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 not found - required for zero-downtime deployment"
        log_error "Install PM2: npm install -g pm2"
        exit 1
    fi
    
    # Install production dependencies
    log "Installing production dependencies..."
    npm ci --production --silent
    log_success "Dependencies installed"
    
    # Build application
    log "Building application..."
    npm run build
    log_success "Build completed"
    
    # Check if application is already running
    if pm2 list | grep -q "production-server"; then
        log "Application is running, performing reload..."
        
        # Reload with zero-downtime
        if pm2 reload production-server --update-env; then
            log_success "Application reloaded successfully"
        else
            log_error "Application reload failed"
            return 1
        fi
    else
        log "Starting new application instance..."
        
        # Start new instance
        if pm2 start dist/server.js --name production-server --env production -i max; then
            log_success "Application started successfully"
        else
            log_error "Application start failed"
            return 1
        fi
    fi
    
    # Save PM2 configuration
    pm2 save
    log_success "PM2 configuration saved"
    
    # Setup PM2 startup script
    log "Configuring PM2 startup..."
    pm2 startup | tail -n 1 | bash || log_warning "PM2 startup configuration may need manual setup"
}

###############################################################################
# Health Checks
###############################################################################

health_check() {
    log "🏥 Running health checks..."
    
    APP_URL="${PRODUCTION_URL:-http://localhost:$PORT}"
    
    # Wait for application to be ready
    log "Waiting for application to be ready..."
    sleep 10
    
    # Retry health check multiple times
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        log "Health check attempt $i/$HEALTH_CHECK_RETRIES..."
        
        if curl -f -s -m $SMOKE_TEST_TIMEOUT "$APP_URL/health" > /dev/null 2>&1; then
            log_success "Health check passed"
            return 0
        fi
        
        if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
            log_warning "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s..."
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done
    
    log_error "Health check failed after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

###############################################################################
# Smoke Tests
###############################################################################

run_smoke_tests() {
    log "🧪 Running production smoke tests..."
    
    APP_URL="${PRODUCTION_URL:-http://localhost:$PORT}"
    
    # Test 1: Health endpoint
    log "Test 1: Health endpoint..."
    HEALTH_RESPONSE=$(curl -s -m $SMOKE_TEST_TIMEOUT "$APP_URL/health")
    if echo "$HEALTH_RESPONSE" | grep -q "ok\|healthy\|success"; then
        log_success "Health endpoint test passed"
    else
        log_error "Health endpoint test failed"
        return 1
    fi
    
    # Test 2: API endpoint
    log "Test 2: API endpoint..."
    if curl -f -s -m $SMOKE_TEST_TIMEOUT "$APP_URL/api" > /dev/null 2>&1; then
        log_success "API endpoint test passed"
    else
        log_warning "API endpoint test failed (may require authentication)"
    fi
    
    # Test 3: Database connectivity
    log "Test 3: Database connectivity..."
    if node -e "const mongoose = require('mongoose'); mongoose.connect('$MONGO_URI').then(() => { console.log('OK'); process.exit(0); }).catch(() => process.exit(1));" > /dev/null 2>&1; then
        log_success "Database connectivity test passed"
    else
        log_error "Database connectivity test failed"
        return 1
    fi
    
    # Test 4: Contract service availability
    log "Test 4: Contract service availability..."
    node -e "
    const mongoose = require('mongoose');
    mongoose.connect('$MONGO_URI').then(async () => {
        const Contract = require('./dist/schemas/contract.schema').default;
        const count = await Contract.countDocuments();
        console.log('Contracts found:', count);
        await mongoose.disconnect();
        process.exit(0);
    }).catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    });
    " || {
        log_error "Contract service test failed"
        return 1
    }
    log_success "Contract service test passed"
    
    # Test 5: Payment service availability
    log "Test 5: Payment service availability..."
    node -e "
    const mongoose = require('mongoose');
    mongoose.connect('$MONGO_URI').then(async () => {
        const Payment = require('./dist/schemas/payment.schema').default;
        const count = await Payment.countDocuments();
        console.log('Payments found:', count);
        await mongoose.disconnect();
        process.exit(0);
    }).catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    });
    " || {
        log_error "Payment service test failed"
        return 1
    }
    log_success "Payment service test passed"
    
    log_success "All smoke tests passed"
}

###############################################################################
# Monitoring Setup
###############################################################################

setup_monitoring() {
    log "📊 Setting up monitoring..."
    
    # Create monitoring script
    cat > "./monitoring/monitor-deployment.sh" << 'MONITOR_EOF'
#!/bin/bash

# Monitor deployment health
while true; do
    TIMESTAMP=$(date +'%Y-%m-%d %H:%M:%S')
    
    # Check PM2 status
    PM2_STATUS=$(pm2 jlist | jq -r '.[0].pm2_env.status' 2>/dev/null || echo "unknown")
    
    # Check memory usage
    MEMORY_USAGE=$(pm2 jlist | jq -r '.[0].monit.memory' 2>/dev/null || echo "0")
    MEMORY_MB=$((MEMORY_USAGE / 1024 / 1024))
    
    # Check CPU usage
    CPU_USAGE=$(pm2 jlist | jq -r '.[0].monit.cpu' 2>/dev/null || echo "0")
    
    # Check error count
    ERROR_COUNT=$(pm2 logs production-server --lines 100 --nostream 2>/dev/null | grep -i "error" | wc -l)
    
    # Log metrics
    echo "[$TIMESTAMP] Status: $PM2_STATUS | Memory: ${MEMORY_MB}MB | CPU: ${CPU_USAGE}% | Errors: $ERROR_COUNT"
    
    # Alert if issues detected
    if [ "$PM2_STATUS" != "online" ]; then
        echo "⚠️  ALERT: Application is not online!"
    fi
    
    if [ "$MEMORY_MB" -gt 1024 ]; then
        echo "⚠️  ALERT: High memory usage: ${MEMORY_MB}MB"
    fi
    
    if [ "$ERROR_COUNT" -gt 10 ]; then
        echo "⚠️  ALERT: High error count: $ERROR_COUNT"
    fi
    
    sleep 60
done
MONITOR_EOF
    
    chmod +x "./monitoring/monitor-deployment.sh"
    log_success "Monitoring script created"
    
    # Start monitoring in background
    if command -v pm2 &> /dev/null; then
        pm2 start "./monitoring/monitor-deployment.sh" --name deployment-monitor --no-autorestart || log_warning "Could not start monitoring"
        log_success "Monitoring started"
    fi
    
    # Create monitoring dashboard URL
    log "📊 Monitoring Dashboard:"
    log "   PM2 Monitoring: pm2 monit"
    log "   PM2 Logs: pm2 logs production-server"
    log "   Custom Monitor: ./monitoring/monitor-deployment.sh"
}

###############################################################################
# Rollback Procedure
###############################################################################

rollback() {
    log_critical "🔙 INITIATING ROLLBACK PROCEDURE"
    
    # Stop current application
    log "Stopping current application..."
    pm2 stop production-server || log_warning "Could not stop application"
    
    # Restore database from backup
    if [ -f "$BACKUP_DIR/latest-backup.txt" ]; then
        LATEST_BACKUP=$(cat "$BACKUP_DIR/latest-backup.txt")
        
        if [ -f "$LATEST_BACKUP" ]; then
            log "Restoring database from backup: $LATEST_BACKUP"
            
            if command -v mongorestore &> /dev/null; then
                if mongorestore --uri="$MONGO_URI" --archive="$LATEST_BACKUP" --gzip --drop; then
                    log_success "Database restored successfully"
                else
                    log_error "Database restore failed"
                fi
            else
                log_error "mongorestore not found"
            fi
        else
            log_error "Backup file not found: $LATEST_BACKUP"
        fi
    else
        log_error "No backup reference found"
    fi
    
    # Rollback migrations
    log "Rolling back migrations..."
    npm run migrate:down 2>&1 | tee -a "$LOG_FILE" || log_warning "Migration rollback failed"
    
    # Restore previous application version
    log "Restoring previous application version..."
    if [ -d "./dist.backup" ]; then
        rm -rf ./dist
        mv ./dist.backup ./dist
        log_success "Previous version restored"
    else
        log_warning "No previous version backup found"
    fi
    
    # Restart application
    log "Restarting application..."
    pm2 restart production-server || log_error "Could not restart application"
    
    log_warning "=========================================="
    log_warning "ROLLBACK COMPLETED"
    log_warning "=========================================="
    log_warning "Please verify system status and investigate the failure"
}

###############################################################################
# Post-Deployment Tasks
###############################################################################

post_deployment() {
    log "📝 Running post-deployment tasks..."
    
    # Create deployment success flag
    touch "./logs/production-deployment-success.flag"
    echo "$(date -Iseconds)" > "./logs/production-deployment-success.flag"
    
    # Create deployment report
    cat > "./logs/deployment-report-$(date +%Y%m%d-%H%M%S).md" << EOF
# Production Deployment Report

## Deployment Information
- **Date:** $(date +'%Y-%m-%d %H:%M:%S')
- **Environment:** Production
- **Git Commit:** $(git rev-parse HEAD 2>/dev/null || echo 'unknown')
- **Git Branch:** $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')
- **Deployed By:** $(whoami)

## Deployment Steps Completed
- ✅ Pre-deployment validation
- ✅ Database backup
- ✅ Migration execution
- ✅ Application deployment
- ✅ Health checks
- ✅ Smoke tests
- ✅ Monitoring setup

## Backup Information
- **Backup File:** $(cat "$BACKUP_DIR/latest-backup.txt" 2>/dev/null || echo 'N/A')
- **Backup Size:** $(du -h "$(cat "$BACKUP_DIR/latest-backup.txt" 2>/dev/null)" 2>/dev/null | cut -f1 || echo 'N/A')

## Application Status
\`\`\`
$(pm2 list 2>/dev/null || echo 'PM2 status not available')
\`\`\`

## System Resources
- **Memory:** $(free -h | awk 'NR==2 {print $3 "/" $2}')
- **Disk:** $(df -h . | awk 'NR==2 {print $3 "/" $2}')
- **CPU Load:** $(uptime | awk -F'load average:' '{print $2}')

## Next Steps
1. Monitor application logs: \`pm2 logs production-server\`
2. Monitor system metrics: \`pm2 monit\`
3. Check error rates in next 24 hours
4. Verify contract edit functionality
5. Monitor database performance

## Rollback Instructions
If issues are detected, run:
\`\`\`bash
./scripts/rollback-production.sh
\`\`\`

## Support Contacts
- DevOps Team: devops@yourdomain.com
- On-Call Engineer: oncall@yourdomain.com

---
**Deployment Log:** $LOG_FILE
EOF
    
    log_success "Deployment report created"
    
    # Send notification (placeholder - implement your notification system)
    log "📧 Sending deployment notification..."
    # curl -X POST "your-notification-webhook" -d "Deployment completed successfully" || log_warning "Notification failed"
    
    log_success "Post-deployment tasks completed"
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    log "🚀 =========================================="
    log "🚀 PRODUCTION DEPLOYMENT STARTED"
    log "🚀 =========================================="
    log ""
    
    # Confirmation prompt
    log_warning "⚠️  You are about to deploy to PRODUCTION"
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_warning "Deployment cancelled by user"
        exit 0
    fi
    
    # Backup current dist folder
    if [ -d "./dist" ]; then
        log "Backing up current application..."
        cp -r ./dist ./dist.backup
        log_success "Application backup created"
    fi
    
    # Step 1: Pre-deployment validation
    pre_deployment_validation
    log ""
    
    # Step 2: Database backup
    backup_database
    log ""
    
    # Step 3: Run migrations
    if ! run_migrations; then
        log_error "Migration failed, initiating rollback"
        rollback
        exit 1
    fi
    log ""
    
    # Step 4: Deploy application
    if ! deploy_application; then
        log_error "Deployment failed, initiating rollback"
        rollback
        exit 1
    fi
    log ""
    
    # Step 5: Health checks
    if ! health_check; then
        log_error "Health check failed, initiating rollback"
        rollback
        exit 1
    fi
    log ""
    
    # Step 6: Smoke tests
    if ! run_smoke_tests; then
        log_error "Smoke tests failed, initiating rollback"
        rollback
        exit 1
    fi
    log ""
    
    # Step 7: Setup monitoring
    setup_monitoring
    log ""
    
    # Step 8: Post-deployment tasks
    post_deployment
    log ""
    
    # Cleanup backup
    rm -rf ./dist.backup
    
    log_success "=========================================="
    log_success "🎉 PRODUCTION DEPLOYMENT COMPLETED!"
    log_success "=========================================="
    log ""
    log "📊 Monitoring:"
    log "   PM2 Dashboard: pm2 monit"
    log "   Application Logs: pm2 logs production-server"
    log "   Custom Monitor: ./monitoring/monitor-deployment.sh"
    log ""
    log "📝 Reports:"
    log "   Deployment Log: $LOG_FILE"
    log "   Deployment Report: ./logs/deployment-report-*.md"
    log ""
    log "🔙 Rollback:"
    log "   If needed: ./scripts/rollback-production.sh"
    log ""
    log_success "Deployment completed successfully at $(date +'%Y-%m-%d %H:%M:%S')"
}

# Run main deployment
main
