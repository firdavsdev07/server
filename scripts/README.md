# 🚀 MongoDB Backup - Ishlatish Qo'llanmasi

## ✅ Tayyor! Hamma Narsa Sozlangan

`.env` faylingizda quyidagi o'zgaruvchilar qo'shildi:

```bash
MONGO_URI=mongodb://localhost:27017
DB_NAME=nasiya_db
TELEGRAM_BOT_TOKEN=7869653326:AAF9gV6aBPxqLmW3rBDEFGHijklmnopqrst
TELEGRAM_CHAT_ID=-1003478605504
BACKUP_DIR=/tmp/mongodb-backups
```

## 🎯 Asosiy Xususiyat

**Agar ma'lumotlar o'zgarmasa, qayta yuklanmaydi!**
- Har bir backup file'ning hash (MD5) hisoblanadi
- Agar bir xil backup allaqachon Telegram'da bo'lsa, skip qilinadi
- Bu trafik va vaqtni tejaydi

---

## 📋 Tezkor Ishga Tushirish (3 daqiqa)

### 1️⃣ Test Backup (barcha tekshiruvlar bilan)
```bash
cd /path/to/your/project/server/scripts
chmod +x test-backup.sh backup-mongodb.sh
./test-backup.sh
```

Bu script:
- ✅ Barcha o'zgaruvchilarni tekshiradi
- ✅ MongoDB ishlayotganini tekshiradi
- ✅ mongodump o'rnatilganini tekshiradi
- ✅ Telegram bot'ni tekshiradi
- ✅ Telegram kanalga test xabar yuboradi
- ✅ Backup yaratadi va yuklaydi

### 2️⃣ Cron O'rnatish (avtomatik backup)
```bash
chmod +x setup-backup-cron.sh
./setup-backup-cron.sh
```

**Test uchun:** `1` - Har 5 daqiqada  
**Production:** `3` - Har kuni soat 2:00 da

### 3️⃣ Loglarni Kuzatish
```bash
tail -f /var/log/mongodb-backup.log
```

---

## 🔄 Manual Backup

Qachonki kerak bo'lsa:

```bash
cd server/scripts
source ../.env
./backup-mongodb.sh
```

---

## 📊 Qanday Ishlaydi?

### Birinchi Backup:
```
1. MongoDB'dan backup oladi → crm_db_2025-01-04_14-00-00.archive
2. File hash hisoblanadi → abc123def456...
3. Hash saqlanadi → .uploaded_hashes
4. Telegram'ga yuklanadi ✅
```

### Ikkinchi Backup (ma'lumot o'zgarmagan):
```
1. MongoDB'dan backup oladi → crm_db_2025-01-04_14-05-00.archive
2. File hash hisoblanadi → abc123def456... (bir xil!)
3. Hash tekshiriladi → ⏭️ SKIP (allaqachon bor)
4. Upload qilinmaydi (trafik tejaldi) ✅
```

### Uchinchi Backup (yangi ma'lumot qo'shilgan):
```
1. MongoDB'dan backup oladi → crm_db_2025-01-04_14-10-00.archive
2. File hash hisoblanadi → xyz789ghi012... (boshqa!)
3. Hash yangi → ✅ Telegram'ga yuklash kerak
4. Telegram'ga yuklanadi ✅
```

---

## 📁 Fayllar

```
server/
├── .env                          # ✅ Sozlangan (tokenlar, DB nomi)
└── scripts/
    ├── backup-mongodb.sh         # Asosiy backup script
    ├── restore-mongodb.sh        # Restore script
    ├── setup-backup-cron.sh      # Cron setup
    ├── test-backup.sh            # ⭐ Test script (barcha tekshiruvlar)
    └── README.md                 # Bu fayl
```

---

## 🧪 Test Natijasi

Test muvaffaqiyatli bo'lsa:

```
✅ .env file exists
✅ DB_NAME: nasiya_db
✅ MONGO_URI: mongodb://localhost:27017
✅ TELEGRAM_BOT_TOKEN: 7869653326:AAF9gV6aB...
✅ TELEGRAM_CHAT_ID: -1003478605504
✅ mongodump installed
✅ MongoDB is running
✅ Database 'nasiya_db' exists
   Collections: customers, contracts, payments, employees, expenses
✅ Telegram bot connected: @your_bot_name
✅ Can send messages to channel

============================================
✅ All checks passed!
============================================

🚀 Running backup now...

🔄 Starting MongoDB backup...
📊 Database: nasiya_db
📦 Output: /tmp/mongodb-backups/crm_db_2025-01-04_14-30-00.archive
✅ Backup created successfully
📦 Size: 2.5M
🔍 Checking if backup already uploaded...
📦 Hash: abc123def456789...
📤 Uploading to Telegram...
✅ Successfully uploaded to Telegram

✅ Test completed!
```

Telegram kanalda file ko'rinadi! 🎉

---

## 🔄 Restore (Tiklash)

### Telegram'dan yuklab olish va tiklash:

```bash
cd server/scripts
source ../.env

# Restore
./restore-mongodb.sh /path/to/crm_db_2025-01-04.archive

# Yoki ustiga yozish (⚠️ xavfli)
./restore-mongodb.sh /path/to/backup.archive --drop
```

### Tekshirish:
```bash
mongosh
use nasiya_db
show collections
db.customers.countDocuments()
```

---

## 📊 Cron Monitoring

### Cron jobni ko'rish:
```bash
crontab -l
```

### Loglarni kuzatish:
```bash
# Real-time
tail -f /var/log/mongodb-backup.log

# Oxirgi 50 qator
tail -50 /var/log/mongodb-backup.log

# Bugungi backup'lar
grep "$(date +%Y-%m-%d)" /var/log/mongodb-backup.log
```

### Backup hajmini kuzatish:
```bash
# Barcha backup'lar
ls -lh /tmp/mongodb-backups/

# Jami hajm
du -sh /tmp/mongodb-backups/

# Yuklab o'tkazilgan hash'lar
cat /tmp/mongodb-backups/.uploaded_hashes
```

---

## 🎯 Production'ga O'tish

Test muvaffaqiyatli bo'lgandan keyin:

```bash
crontab -e
```

O'zgartiring:
```bash
# Test (har 5 daqiqa)
*/5 * * * * /path/to/backup-wrapper.sh >> /var/log/mongodb-backup.log 2>&1

# Production (har kuni soat 2:00)
0 2 * * * /path/to/backup-wrapper.sh >> /var/log/mongodb-backup.log 2>&1
```

---

## ❓ Tez-tez Beriladigan Savollar

### Q: mongodump yo'q desa?
```bash
sudo apt-get update
sudo apt-get install mongodb-database-tools -y
```

### Q: Telegram'ga file bormasa?
1. Bot admin bo'lishi kerak kanalda
2. File yuborish huquqi bo'lishi kerak
3. Token to'g'rimi tekshiring:
```bash
source server/.env
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

### Q: Hash file qayerda?
```bash
cat /tmp/mongodb-backups/.uploaded_hashes
```

Format: `hash|date|filename`

### Q: Hash file'ni tozalash (barchasi qayta yuklash)?
```bash
rm /tmp/mongodb-backups/.uploaded_hashes
```

### Q: Local backup'larni o'chirish (faqat Telegram'da saqlash)?
`backup-mongodb.sh` faylida quyidagi qatorni uncomment qiling:
```bash
rm -f "$BACKUP_PATH"
```

---

## 🎉 Tayyor!

Endi sizning sistema:
- ✅ Avtomatik backup oladi
- ✅ Telegram'ga yuklaydi
- ✅ Bir xil backup'larni skip qiladi (trafik tejaydi)
- ✅ Hash bilan tekshiradi
- ✅ 7 kunlik tarix saqlaydi
- ✅ Loglar yoziladi

**Birinchi ishlatish:**
```bash
cd server/scripts
./test-backup.sh
```

**Telegram kanalda file paydo bo'lishi kerak!** 🚀
