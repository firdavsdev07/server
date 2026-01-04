#!/bin/bash

# ============================================
# MongoDB Restore Script
# ============================================

set -e  # Exit on any error

# ============================================
# CONFIGURATION
# ============================================
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-your_database_name}"

# ============================================
# USAGE
# ============================================
if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup-file.archive> [--drop]"
    echo ""
    echo "Examples:"
    echo "  $0 crm_db_2025-01-04.archive"
    echo "  $0 crm_db_2025-01-04.archive --drop"
    echo ""
    echo "Options:"
    echo "  --drop    Drop existing collections before restore (overwrite)"
    exit 1
fi

BACKUP_FILE="$1"
DROP_FLAG=""

if [ "$2" = "--drop" ]; then
    DROP_FLAG="--drop"
    echo "⚠️  WARNING: --drop flag detected. Existing data will be overwritten!"
    read -p "Continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "❌ Restore cancelled"
        exit 0
    fi
fi

# ============================================
# VALIDATION
# ============================================
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [ -z "$DB_NAME" ] || [ "$DB_NAME" = "your_database_name" ]; then
    echo "❌ Error: DB_NAME not set properly"
    exit 1
fi

# ============================================
# RESTORE MONGODB
# ============================================
echo "🔄 Starting MongoDB restore..."
echo "📊 Database: $DB_NAME"
echo "📦 Backup file: $BACKUP_FILE"
echo "🔧 URI: $MONGO_URI"

mongorestore \
    --uri="$MONGO_URI" \
    --archive="$BACKUP_FILE" \
    --gzip \
    $DROP_FLAG

echo "✅ Restore completed successfully"
echo ""
echo "📊 Database restored: $DB_NAME"
echo "🔍 Verify with: mongosh --eval 'show dbs'"
