# ✅ TAYYOR! MongoDB Backup Tizimi

## 🎯 Nima Qilindi?

### 1. `.env` Faylga Qo'shildi:
```bash
MONGO_URI=mongodb://localhost:27017
DB_NAME=nasiya_db
TELEGRAM_BOT_TOKEN=7869653326:AAF9gV6aBPxqLmW3rBDEFGHijklmnopqrst
TELEGRAM_CHAT_ID=-1003478605504
BACKUP_DIR=/tmp/mongodb-backups
```

### 2. Smart Duplicate Detection ⭐
- Har bir backup file'ning MD5 hash hisoblanadi
- Agar bir xil backup allaqachon Telegram'da bo'lsa, **qayta yuklanmaydi**
- Hash fayl: `/tmp/mongodb-backups/.uploaded_hashes`
- Trafik va vaqt tejaladi!

### 3. Yaratilgan Scriptlar:
- ✅ `backup-mongodb.sh` - Asosiy backup (hash check bilan)
- ✅ `restore-mongodb.sh` - Database tiklash
- ✅ `setup-backup-cron.sh` - Cron o'rnatish
- ✅ `test-backup.sh` - To'liq test (barcha tekshiruvlar)

---

## 🚀 HOZIR QILING (3 daqiqa):

### Bitta buyruq:
```bash
cd server/scripts && ./test-backup.sh
```

Bu:
1. ✅ Barcha sozlamalarni tekshiradi
2. ✅ MongoDB va Telegram connection test qiladi
3. ✅ Backup yaratadi
4. ✅ Telegram'ga yuklaydi

**Natija:** Telegram kanalda `crm_db_2025-01-04_XX-XX-XX.archive` file paydo bo'ladi! 🎉

---

## ⚙️ Cron O'rnatish (1 daqiqa):

```bash
./setup-backup-cron.sh
```

**Test:** `1` - Har 5 daqiqada  
**Production:** `3` - Har kuni soat 2:00

**Log kuzatish:**
```bash
tail -f /var/log/mongodb-backup.log
```

---

## 💡 Smart Features:

### Bir Xil Backup Skip:
```
14:00 → Backup (5 MB) → Hash: abc123 → ✅ Uploaded
14:05 → Backup (5 MB) → Hash: abc123 → ⏭️ SKIP (ma'lumot o'zgarmagan)
14:10 → Backup (5 MB) → Hash: abc123 → ⏭️ SKIP
14:15 → Yangi data → Hash: xyz789 → ✅ Uploaded (o'zgardi!)
```

### Afzalligi:
- 🚀 Trafik tejaydi (tez)
- 💰 Telegram API limit tejaydi
- 🔒 Faqat o'zgarganda yuklaydi
- ✅ Har doim local backup bor

---

## 📊 Monitoring:

```bash
# Real-time log
tail -f /var/log/mongodb-backup.log

# Barcha backup'lar
ls -lh /tmp/mongodb-backups/

# Yuklab o'tkazilgan hash'lar
cat /tmp/mongodb-backups/.uploaded_hashes
```

---

## 🔄 Restore:

```bash
cd server/scripts
source ../.env
./restore-mongodb.sh /path/to/backup.archive
```

---

## 📞 Yordam:

### Xato bo'lsa:
1. `./test-backup.sh` - barcha tekshiruvlar
2. `tail -f /var/log/mongodb-backup.log` - log ko'rish
3. `server/scripts/README.md` - to'liq qo'llanma

### Hash'ni tozalash (barchasini qayta yuklash):
```bash
rm /tmp/mongodb-backups/.uploaded_hashes
```

---

## ✅ Checklist:

- [x] `.env` sozlangan (DB, Token, Chat ID)
- [x] Scriptlar executable (`chmod +x`)
- [x] Hash-based duplicate detection
- [x] Test script yaratilgan
- [ ] **Test qilish:** `./test-backup.sh`
- [ ] **Cron o'rnatish:** `./setup-backup-cron.sh`

---

## 🎉 Tayyor!

**Birinchi qadam:** 
```bash
cd server/scripts
./test-backup.sh
```

**Telegram'da file ko'rinishi kerak! 🚀**
