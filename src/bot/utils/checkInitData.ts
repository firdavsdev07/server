// import crypto from "crypto";
import logger from "../../utils/logger";

// /**
//  * Telegram WebApp initData ni tekshiradi va foydalanuvchi ma'lumotini qaytaradi
//  * @param initData - window.Telegram.WebApp.initDataRaw dan olingan string
//  * @param botToken - Telegram bot tokeni
//  * @returns Foydalanuvchi ma'lumoti va auth_date yoki null agar noto'g'ri bo'lsa
//  */
// export function checkTelegramInitData(initData: string, botToken: string) {
//   logger.debug("\n🔐 Tekshirish boshlandi...");
//   logger.debug("✅ Kiritilgan initData:\n", initData);
//   logger.debug("✅ Bot token:", botToken);

//   if (!initData || !botToken) {
//     logger.debug("⛔️ initData yoki botToken mavjud emas");
//     return null;
//   }

//   const params = new URLSearchParams(initData);
//   const hash = params.get("hash");

//   logger.debug("📦 URLSearchParams:\n", [...params.entries()]);
//   logger.debug("🧩 Berilgan hash:", hash);

//   if (!hash) {
//     logger.debug("⛔️ hash topilmadi!");
//     return null;
//   }

//   // 'hash' ni olib tashlaymiz
//   params.delete("hash");
//   params.delete("signature");

//   // data_check_string tuzamiz
//   const dataCheckString = [...params.entries()]
//     .map(([key, value]) => `${key}=${value}`)
//     .sort()
//     .join("\n");

//   logger.debug("📄 Yig'ilgan dataCheckString:\n", dataCheckString);

//   // HMAC hisoblash uchun secret key
//   const secretKey = crypto.createHash("sha256").update(botToken).digest();
//   logger.debug("🔑 Hisoblangan secretKey (buffer):", secretKey.toString("hex"));

//   // computedHash ni hisoblash
//   const computedHash = crypto
//     .createHmac("sha256", secretKey)
//     .update(dataCheckString)
//     .digest("hex");

//   logger.debug("🧮 Hisoblangan computedHash:", computedHash);

//   // Taqqoslash
//   if (computedHash !== hash) {
//     logger.debug("❌ Hashlar mos kelmadi!");
//     return null;
//   }

//   // Foydalanuvchini o‘qib olish
//   try {
//     const userStr = params.get("user");
//     if (!userStr) {
//       logger.debug("⛔️ 'user' topilmadi!");
//       return null;
//     }

//     const user = JSON.parse(userStr);
//     const authDate = params.get("auth_date");

//     logger.debug("✅ Foydalanuvchi JSON:", user);
//     logger.debug("🕒 Auth date:", authDate);

//     return { user, authDate };
//   } catch (err) {
//     logger.error("❌ JSON parse error:", err);
//     return null;
//   }
// }
/**
 * Telegram initData stringdan foydalanuvchi ID ni ajratib olish
 * @param initData - window.Telegram.WebApp.initData dan olingan string
 * @returns Telegram foydalanuvchi ID yoki null
 */
export function checkTelegramInitData(initData: string): number | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const userJson = params.get("user");

  if (!userJson) return null;

  try {
    const user = JSON.parse(userJson);
    return user?.id || null;
  } catch (err) {
    logger.error("❌ JSON parse xatolik:", err);
    return null;
  }
}
