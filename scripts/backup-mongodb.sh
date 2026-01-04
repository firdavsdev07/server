#!/bin/bash

# ============================================
# MongoDB Backup Script with Telegram Upload
# ============================================

set -e  # Exit on any error

# ============================================
# CONFIGURATION
# ============================================
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-your_database_name}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/mongodb-backups}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_CHAT_ID}"

# ============================================
# VARIABLES
# ============================================
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="crm_db_${DATE}.archive"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# ============================================
# VALIDATION
# ============================================
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Error: TELEGRAM_BOT_TOKEN not set"
    exit 1
fi

if [ -z "$CHAT_ID" ]; then
    echo "❌ Error: TELEGRAM_CHAT_ID not set"
    exit 1
fi

if [ -z "$DB_NAME" ] || [ "$DB_NAME" = "your_database_name" ]; then
    echo "❌ Error: DB_NAME not set properly"
    exit 1
fi

# ============================================
# CREATE BACKUP DIRECTORY
# ============================================
mkdir -p "$BACKUP_DIR"

# ============================================
# BACKUP MONGODB
# ============================================
echo "🔄 Starting MongoDB backup..."
echo "📊 Database: $DB_NAME"
echo "📦 Output: $BACKUP_PATH"

mongodump \
    --uri="$MONGO_URI" \
    --db="$DB_NAME" \
    --archive="$BACKUP_PATH" \
    --gzip

if [ ! -f "$BACKUP_PATH" ]; then
    echo "❌ Backup failed: file not created"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "✅ Backup created successfully"
echo "📦 Size: $BACKUP_SIZE"

# ============================================
# CALCULATE FILE HASH (to avoid duplicate uploads)
# ============================================
BACKUP_HASH=$(md5sum "$BACKUP_PATH" | cut -d' ' -f1)
HASH_FILE="${BACKUP_DIR}/.uploaded_hashes"
mkdir -p "$BACKUP_DIR"

echo "🔍 Checking if backup already uploaded..."
echo "📦 Hash: $BACKUP_HASH"

# Check if this hash was already uploaded
if [ -f "$HASH_FILE" ] && grep -q "$BACKUP_HASH" "$HASH_FILE"; then
    echo "⏭️  Identical backup already uploaded to Telegram, skipping"
    echo "📦 File: $BACKUP_FILE"
    
    # Keep the local file but don't upload again
    echo "✅ Backup process completed (skipped upload)"
else
    # ============================================
    # UPLOAD TO TELEGRAM
    # ============================================
    echo "📤 Uploading to Telegram..."

    TELEGRAM_API="https://api.telegram.org/bot${BOT_TOKEN}"

    RESPONSE=$(curl -s -X POST "${TELEGRAM_API}/sendDocument" \
        -F "chat_id=$CHAT_ID" \
        -F "document=@$BACKUP_PATH" \
        -F "caption=🗄️ MongoDB Backup
📅 Date: $DATE
📊 Database: $DB_NAME
📦 Size: $BACKUP_SIZE
🔐 Hash: $BACKUP_HASH
✅ Status: Success")

    # Check if upload was successful
    if echo "$RESPONSE" | grep -q '"ok":true'; then
        echo "✅ Successfully uploaded to Telegram"
        
        # Save hash to prevent duplicate uploads
        echo "$BACKUP_HASH|$DATE|$BACKUP_FILE" >> "$HASH_FILE"
        
        # Optional: Remove local backup after successful upload
        # Uncomment the next line if you want to keep only Telegram copy
        # rm -f "$BACKUP_PATH"
        
    else
        echo "❌ Failed to upload to Telegram"
        echo "Response: $RESPONSE"
        exit 1
    fi
fi

# ============================================
# CLEANUP OLD BACKUPS (keep last 7 days)
# ============================================
echo "🧹 Cleaning old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -name "crm_db_*.archive" -type f -mtime +7 -delete

echo "✅ Backup process completed successfully"
