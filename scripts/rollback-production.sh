#!/bin/bash

###############################################################################
# Production Rollback Script
# 
# This script handles emergency rollback of production deployment
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKUP_DIR="./backups/production"
LOG_FILE="./logs/rollback-production-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "./logs"

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

###############################################################################
# Rollback Procedure
###############################################################################

rollback() {
    log "🔙 =========================================="
    log "🔙 PRODUCTION ROLLBACK STARTED"
    log "🔙 =========================================="
    log ""
    
    # Load environment
    if [ -f ".env.production" ]; then
        export $(cat .env.production | grep -v '^#' | xargs)
    fi
    
    # Confirmation
    log_warning "⚠️  You are about to ROLLBACK production"
    log_warning "This will:"
    log_warning "  - Stop the current application"
    log_warning "  - Restore database from latest backup"
    log_warning "  - Rollback database migrations"
    log_warning "  - Restart the previous application version"
    log ""
    read -p "Are you sure? (yes/no): " -r
    echo
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_warning "Rollback cancelled"
        exit 0
    fi
    
    # Step 1: Stop application
    log "Stopping application..."
    if command -v pm2 &> /dev/null; then
        pm2 stop production-server || log_warning "Could not stop application"
        log_success "Application stopped"
    fi
    
    # Step 2: List available backups
    log "Available backups:"
    ls -lht "$BACKUP_DIR"/backup-*.gz 2>/dev/null | head -5 || log_error "No backups found"
    log ""
    
    # Step 3: Restore database
    if [ -f "$BACKUP_DIR/latest-backup.txt" ]; then
        BACKUP_FILE=$(cat "$BACKUP_DIR/latest-backup.txt")
        
        if [ -f "$BACKUP_FILE" ]; then
            log "Restoring database from: $BACKUP_FILE"
            
            if command -v mongorestore &> /dev/null; then
                if mongorestore --uri="$MONGO_URI" --archive="$BACKUP_FILE" --gzip --drop; then
                    log_success "Database restored successfully"
                else
                    log_error "Database restore failed"
                    exit 1
                fi
            else
                log_error "mongorestore not found"
                exit 1
            fi
        else
            log_error "Backup file not found: $BACKUP_FILE"
            exit 1
        fi
    else
        log_error "No backup reference found"
        exit 1
    fi
    
    # Step 4: Rollback migrations
    log "Rolling back migrations..."
    if npm run migrate:down; then
        log_success "Migrations rolled back"
    else
        log_warning "Migration rollback failed (may be expected)"
    fi
    
    # Step 5: Restart application
    log "Restarting application..."
    if command -v pm2 &> /dev/null; then
        pm2 restart production-server
        log_success "Application restarted"
    fi
    
    # Step 6: Health check
    log "Running health check..."
    sleep 10
    
    APP_URL="${PRODUCTION_URL:-http://localhost:$PORT}"
    if curl -f -s "$APP_URL/health" > /dev/null 2>&1; then
        log_success "Health check passed"
    else
        log_error "Health check failed - manual intervention required"
    fi
    
    log ""
    log_success "=========================================="
    log_success "ROLLBACK COMPLETED"
    log_success "=========================================="
    log ""
    log "📝 Rollback log: $LOG_FILE"
    log "📊 Check status: pm2 status"
    log "📋 Check logs: pm2 logs production-server"
}

rollback
