#!/bin/bash
# Auto-generated wrapper script

# Create log file if it doesn't exist
LOG_FILE="/var/log/mongodb-backup.log"
if [ ! -f "$LOG_FILE" ]; then
    # Try with sudo first, if fails use home directory
    if sudo touch "$LOG_FILE" 2>/dev/null && sudo chmod 666 "$LOG_FILE" 2>/dev/null; then
        echo "✅ Log file created: $LOG_FILE"
    else
        # Fallback to user's home directory
        LOG_FILE="$HOME/mongodb-backup.log"
        touch "$LOG_FILE"
        echo "✅ Log file created: $LOG_FILE (fallback location)"
    fi
fi

# Load environment variables
set -a
source "$(dirname "$0")/../.env"
set +a

# Run backup script
"$(dirname "$0")/backup-mongodb.sh"
