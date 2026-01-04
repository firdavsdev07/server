#!/bin/bash

###############################################################################
# Production Monitoring Script
# 
# Continuously monitors production application health and performance
###############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
MONITOR_INTERVAL=60  # seconds
ALERT_THRESHOLD_MEMORY=80  # percentage
ALERT_THRESHOLD_CPU=80  # percentage
ALERT_THRESHOLD_ERRORS=10  # count per interval
LOG_FILE="./logs/monitor-$(date +%Y%m%d).log"

# Load environment
if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

APP_URL="${PRODUCTION_URL:-http://localhost:$PORT}"

# Logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Send alert (implement your notification system)
send_alert() {
    local message="$1"
    log_error "ALERT: $message"
    
    # Example: Send to Slack, email, SMS, etc.
    # curl -X POST "your-webhook-url" -d "{\"text\":\"$message\"}"
}

# Check application health
check_health() {
    local health_response=$(curl -s -m 10 "$APP_URL/health" 2>/dev/null)
    
    if [ -z "$health_response" ]; then
        log_error "Health check failed - no response"
        send_alert "Application health check failed - no response"
        return 1
    fi
    
    local status=$(echo "$health_response" | jq -r '.status' 2>/dev/null)
    
    if [ "$status" = "healthy" ]; then
        log_success "Health check passed"
        return 0
    elif [ "$status" = "degraded" ]; then
        log_warning "Health check degraded"
        return 0
    else
        log_error "Health check failed - status: $status"
        send_alert "Application unhealthy - status: $status"
        return 1
    fi
}

# Check PM2 status
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        log_warning "PM2 not installed"
        return 1
    fi
    
    local pm2_status=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status' 2>/dev/null)
    
    if [ "$pm2_status" = "online" ]; then
        log_success "PM2 status: online"
        return 0
    else
        log_error "PM2 status: $pm2_status"
        send_alert "Application not online - PM2 status: $pm2_status"
        return 1
    fi
}

# Check memory usage
check_memory() {
    if ! command -v pm2 &> /dev/null; then
        return 0
    fi
    
    local memory_bytes=$(pm2 jlist 2>/dev/null | jq -r '.[0].monit.memory' 2>/dev/null)
    local memory_mb=$((memory_bytes / 1024 / 1024))
    
    # Get system total memory
    local total_memory_mb=$(free -m | awk 'NR==2 {print $2}')
    local memory_percent=$((memory_mb * 100 / total_memory_mb))
    
    log "Memory usage: ${memory_mb}MB (${memory_percent}%)"
    
    if [ "$memory_percent" -gt "$ALERT_THRESHOLD_MEMORY" ]; then
        log_warning "High memory usage: ${memory_percent}%"
        send_alert "High memory usage: ${memory_mb}MB (${memory_percent}%)"
    fi
}

# Check CPU usage
check_cpu() {
    if ! command -v pm2 &> /dev/null; then
        return 0
    fi
    
    local cpu_usage=$(pm2 jlist 2>/dev/null | jq -r '.[0].monit.cpu' 2>/dev/null)
    
    log "CPU usage: ${cpu_usage}%"
    
    if (( $(echo "$cpu_usage > $ALERT_THRESHOLD_CPU" | bc -l) )); then
        log_warning "High CPU usage: ${cpu_usage}%"
        send_alert "High CPU usage: ${cpu_usage}%"
    fi
}

# Check error logs
check_errors() {
    if ! command -v pm2 &> /dev/null; then
        return 0
    fi
    
    local error_count=$(pm2 logs production-server --lines 100 --nostream 2>/dev/null | grep -i "error" | wc -l)
    
    log "Recent errors: $error_count"
    
    if [ "$error_count" -gt "$ALERT_THRESHOLD_ERRORS" ]; then
        log_warning "High error count: $error_count"
        send_alert "High error count in logs: $error_count"
    fi
}

# Check database connectivity
check_database() {
    if node -e "const mongoose = require('mongoose'); mongoose.connect('$MONGO_URI', {serverSelectionTimeoutMS: 5000}).then(() => { console.log('OK'); process.exit(0); }).catch(() => process.exit(1));" > /dev/null 2>&1; then
        log_success "Database connection OK"
        return 0
    else
        log_error "Database connection failed"
        send_alert "Database connection failed"
        return 1
    fi
}

# Check disk space
check_disk() {
    local disk_usage=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    
    log "Disk usage: ${disk_usage}%"
    
    if [ "$disk_usage" -gt 80 ]; then
        log_warning "High disk usage: ${disk_usage}%"
        send_alert "High disk usage: ${disk_usage}%"
    fi
}

# Get application metrics
get_metrics() {
    local metrics=$(curl -s -m 10 "$APP_URL/api/metrics" 2>/dev/null)
    
    if [ -n "$metrics" ]; then
        log "Application metrics:"
        echo "$metrics" | jq '.' 2>/dev/null || echo "$metrics"
    fi
}

# Main monitoring loop
monitor() {
    log "🔍 =========================================="
    log "🔍 Production Monitoring Started"
    log "🔍 =========================================="
    log ""
    
    while true; do
        log "--- Monitoring Check ---"
        
        # Run all checks
        check_health
        check_pm2
        check_memory
        check_cpu
        check_errors
        check_database
        check_disk
        
        # Get metrics every 5 minutes
        if [ $(($(date +%s) % 300)) -lt "$MONITOR_INTERVAL" ]; then
            get_metrics
        fi
        
        log ""
        
        # Wait for next interval
        sleep "$MONITOR_INTERVAL"
    done
}

# Handle script termination
cleanup() {
    log "Monitoring stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start monitoring
monitor
