#!/bin/bash

# ============================================
# Test MongoDB Backup Script
# Quick test without waiting for cron
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Testing MongoDB Backup..."
echo ""
echo "📋 Checklist:"
echo ""

# Check 1: .env file exists
if [ -f "$SCRIPT_DIR/../.env" ]; then
    echo "✅ .env file exists"
else
    echo "❌ .env file not found"
    echo "   Create it first: cp .env.backup.example .env"
    exit 1
fi

# Load environment
source "$SCRIPT_DIR/../.env"

# Check 2: MongoDB variables
if [ -z "$DB_NAME" ]; then
    echo "❌ DB_NAME not set in .env"
    exit 1
else
    echo "✅ DB_NAME: $DB_NAME"
fi

if [ -z "$MONGO_URI" ]; then
    echo "❌ MONGO_URI not set in .env"
    exit 1
else
    echo "✅ MONGO_URI: ${MONGO_URI}"
fi

# Check 3: Telegram variables
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ TELEGRAM_BOT_TOKEN not set in .env"
    exit 1
else
    echo "✅ TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:0:20}..."
fi

if [ -z "$TELEGRAM_CHAT_ID" ]; then
    echo "❌ TELEGRAM_CHAT_ID not set in .env"
    exit 1
else
    echo "✅ TELEGRAM_CHAT_ID: $TELEGRAM_CHAT_ID"
fi

# Check 4: mongodump installed
if command -v mongodump &> /dev/null; then
    echo "✅ mongodump installed ($(mongodump --version | head -1))"
else
    echo "❌ mongodump not installed"
    echo "   Install: sudo apt-get install mongodb-database-tools"
    exit 1
fi

# Check 5: MongoDB running
if mongosh --eval "db.version()" > /dev/null 2>&1; then
    echo "✅ MongoDB is running"
else
    echo "❌ MongoDB not running or not accessible"
    echo "   Start: sudo systemctl start mongod"
    exit 1
fi

# Check 6: Database exists
DB_EXISTS=$(mongosh --quiet --eval "db.getMongo().getDBNames().indexOf('$DB_NAME') >= 0 ? 'yes' : 'no'")
if [ "$DB_EXISTS" = "yes" ]; then
    echo "✅ Database '$DB_NAME' exists"
    
    # Show collections
    COLLECTIONS=$(mongosh "$DB_NAME" --quiet --eval "db.getCollectionNames().join(', ')")
    echo "   Collections: $COLLECTIONS"
else
    echo "⚠️  Database '$DB_NAME' not found"
    echo "   Available databases:"
    mongosh --quiet --eval "db.getMongo().getDBNames().forEach(db => print('   - ' + db))"
fi

# Check 7: Telegram bot token valid
echo ""
echo "🔍 Testing Telegram connection..."
BOT_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe")
if echo "$BOT_INFO" | grep -q '"ok":true'; then
    BOT_NAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Telegram bot connected: @$BOT_NAME"
else
    echo "❌ Invalid Telegram bot token"
    exit 1
fi

# Check 8: Can send to channel
TEST_MSG=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=$TELEGRAM_CHAT_ID" \
    -d "text=🧪 Test message from backup script at $(date)")

if echo "$TEST_MSG" | grep -q '"ok":true'; then
    echo "✅ Can send messages to channel"
else
    echo "❌ Cannot send to channel (bot not admin or wrong chat_id?)"
    echo "   Response: $TEST_MSG"
    exit 1
fi

echo ""
echo "============================================"
echo "✅ All checks passed!"
echo "============================================"
echo ""
echo "🚀 Running backup now..."
echo ""

# Run backup
"$SCRIPT_DIR/backup-mongodb.sh"

echo ""
echo "============================================"
echo "✅ Test completed!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Check Telegram channel for backup file"
echo "2. Setup cron job: ./setup-backup-cron.sh"
echo "3. Monitor logs: tail -f /var/log/mongodb-backup.log"
