/**
 * Date Helper - Timezone utilities
 * 
 * O'zbekiston vaqt zonasi bilan ishlash uchun helper'lar
 * UTC+5 (Asia/Tashkent)
 */

/**
 * O'zbekiston vaqt zonasida sanani parse qilish
 * 
 * Format: "2024-12-18" (YYYY-MM-DD)
 * Return: Date object representing midnight in Uzbekistan timezone
 * 
 * @param dateString - Sana string (YYYY-MM-DD)
 * @returns Date object (UTC format, but represents Uzbekistan midnight)
 */
export const parseUzbekistanDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  
  // O'zbekiston vaqti 00:00:00 ni UTC ga o'tkazish
  // Toshkent 2024-12-20 00:00:00 = UTC 2024-12-19 19:00:00
  // Date.UTC() ishlatib to'g'ridan-to'g'ri UTC da yaratamiz
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  
  // O'zbekiston UTC+5, shuning uchun -5 soat qilamiz
  utcDate.setUTCHours(-5);
  
  return utcDate;
};

/**
 * O'zbekiston vaqt zonasida kun boshini olish
 * 
 * @param dateString - Sana string (YYYY-MM-DD)
 * @returns Start of day in Uzbekistan timezone
 */
export const getUzbekistanDayStart = (dateString: string): Date => {
  return parseUzbekistanDate(dateString);
};

/**
 * O'zbekiston vaqt zonasida kun oxirini olish
 * 
 * @param dateString - Sana string (YYYY-MM-DD)
 * @returns End of day in Uzbekistan timezone (23:59:59.999)
 */
export const getUzbekistanDayEnd = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  
  // O'zbekiston vaqti 23:59:59 ni UTC ga o'tkazish
  // Toshkent 2024-12-20 23:59:59 = UTC 2024-12-20 18:59:59
  // Date.UTC() ishlatib to'g'ridan-to'g'ri UTC da yaratamiz va 23-5=18 soat qo'yamiz
  const utcDate = new Date(Date.UTC(year, month - 1, day, 18, 59, 59, 999));
  
  return utcDate;
};

/**
 * Hozirgi O'zbekiston vaqtini olish
 * 
 * @returns Current date/time in Uzbekistan timezone
 */
export const getCurrentUzbekistanTime = (): Date => {
  const now = new Date();
  
  // UTC vaqtni O'zbekiston vaqtiga o'tkazish (+5 soat)
  const uzbekistanTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
  
  return uzbekistanTime;
};

/**
 * Date'ni O'zbekiston formatida string'ga o'tkazish
 * 
 * @param date - Date object
 * @returns String format: "DD.MM.YYYY"
 */
export const formatUzbekistanDate = (date: Date): string => {
  // Date'ni O'zbekiston vaqtiga o'tkazish
  const uzbekistanDate = new Date(date.getTime() + (5 * 60 * 60 * 1000));
  
  const day = uzbekistanDate.getUTCDate().toString().padStart(2, '0');
  const month = (uzbekistanDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = uzbekistanDate.getUTCFullYear();
  
  return `${day}.${month}.${year}`;
};

/**
 * Timezone constants
 */
export const UZBEKISTAN_TIMEZONE_OFFSET = 5; // UTC+5
export const UZBEKISTAN_TIMEZONE_NAME = 'Asia/Tashkent';
