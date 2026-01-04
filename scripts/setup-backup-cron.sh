#!/bin/bash

# ============================================
# Setup MongoDB Backup Cron Job
# ============================================

set -e

# ============================================
# CONFIGURATION
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-mongodb.sh"

# Check if backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "❌ Error: Backup script not found: $BACKUP_SCRIPT"
    exit 1
fi

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# ============================================
# ENVIRONMENT FILE
# ============================================
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  Warning: .env file not found at $ENV_FILE"
    echo "Creating template..."
    
    cat > "$ENV_FILE" << 'EOF'
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017
DB_NAME=your_database_name

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=-1003478605504

# Backup Configuration
BACKUP_DIR=/tmp/mongodb-backups
EOF
    
    echo "✅ Template created: $ENV_FILE"
    echo "⚠️  Please edit the file and set your actual values"
    exit 1
fi

# ============================================
# CREATE WRAPPER SCRIPT
# ============================================
WRAPPER_SCRIPT="$SCRIPT_DIR/backup-wrapper.sh"

cat > "$WRAPPER_SCRIPT" << EOF
#!/bin/bash
# Auto-generated wrapper script

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# Run backup script
"$BACKUP_SCRIPT"
EOF

chmod +x "$WRAPPER_SCRIPT"

# ============================================
# CRON JOB OPTIONS
# ============================================
echo "Select backup frequency:"
echo "1) Every 5 minutes (testing)"
echo "2) Every 1 minute (testing)"
echo "3) Daily at 2:00 AM (production)"
echo "4) Daily at midnight (production)"
echo "5) Custom"

read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        CRON_SCHEDULE="*/5 * * * *"
        DESCRIPTION="every 5 minutes"
        ;;
    2)
        CRON_SCHEDULE="* * * * *"
        DESCRIPTION="every 1 minute"
        ;;
    3)
        CRON_SCHEDULE="0 2 * * *"
        DESCRIPTION="daily at 2:00 AM"
        ;;
    4)
        CRON_SCHEDULE="0 0 * * *"
        DESCRIPTION="daily at midnight"
        ;;
    5)
        read -p "Enter cron schedule (e.g., '0 2 * * *'): " CRON_SCHEDULE
        DESCRIPTION="custom schedule"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

# ============================================
# INSTALL CRON JOB
# ============================================
CRON_JOB="$CRON_SCHEDULE $WRAPPER_SCRIPT >> /var/log/mongodb-backup.log 2>&1"
CRON_COMMENT="# MongoDB Backup - $DESCRIPTION"

# Remove old backup jobs
crontab -l 2>/dev/null | grep -v "backup-wrapper.sh" | grep -v "MongoDB Backup" > /tmp/crontab.tmp || true

# Add new job
echo "$CRON_COMMENT" >> /tmp/crontab.tmp
echo "$CRON_JOB" >> /tmp/crontab.tmp

# Install crontab
crontab /tmp/crontab.tmp
rm /tmp/crontab.tmp

echo "✅ Cron job installed successfully"
echo ""
echo "📋 Schedule: $DESCRIPTION"
echo "📝 Cron: $CRON_SCHEDULE"
echo "📄 Script: $WRAPPER_SCRIPT"
echo "📋 Log: /var/log/mongodb-backup.log"
echo ""
echo "🔍 View current cron jobs:"
echo "   crontab -l"
echo ""
echo "📄 View backup logs:"
echo "   tail -f /var/log/mongodb-backup.log"
echo ""
echo "🧪 Test manually:"
echo "   $WRAPPER_SCRIPT"
