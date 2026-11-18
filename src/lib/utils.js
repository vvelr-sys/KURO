import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PENALTY_RATE_PER_100G } from './constants';

/**
 * Utility for combining Tailwind CSS classes cleanly.
 * 
 * @param  {...any} inputs 
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates 7% Inclusive VAT extracted from total amount.
 * Formula: VAT = totalAmount * 7 / 107 (rounded half-up to 2 decimal places)
 * 
 * @param {number} totalAmount 
 * @returns {number}
 */
export function calculateVat(totalAmount) {
  if (!totalAmount || totalAmount <= 0) return 0.00;
  return Math.round((totalAmount * 7.0 / 107.0) * 100) / 100;
}

/**
 * Calculates leftover meat penalty amount.
 * Formula: 100 THB per 100g (rounded up to next 100g)
 * 
 * @param {number} weightGrams 
 * @returns {number}
 */
export function calculateLeftoverPenalty(weightGrams) {
  if (!weightGrams || weightGrams <= 0) return 0.00;
  return Math.ceil(weightGrams / 100.0) * PENALTY_RATE_PER_100G;
}

/**
 * Formats a numeric value to Thai Baht currency display.
 * 
 * @param {number} amount 
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * แปลงระยะเวลา (milliseconds) เป็นข้อความนาฬิกา เช่น 05:09 หรือ 1:02:30 (ค่าติดลบนับเป็น 0)
 * @param {number} durationMs
 * @returns {string}
 */
export function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const clockTimeFormatter = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

/**
 * แสดงเวลาแบบ 18:30 น. (เวลาไทย)
 * @param {string|number|Date} value
 * @returns {string}
 */
export function formatClockTime(value) {
  return `${clockTimeFormatter.format(new Date(value))} น.`;
}

/**
 * เวลาเริ่มต้นของ "วันนี้" ตามเวลาไทย (00:00 น.) เป็น ISO string — ใช้กรองข้อมูลของวันนี้ เช่น คิววันนี้
 * ประเทศไทยไม่มี Daylight Saving จึงใช้ +07:00 ได้ตลอด
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function getBangkokDayStartIso(now = new Date()) {
  const dateText = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // รูปแบบ YYYY-MM-DD
  return new Date(`${dateText}T00:00:00+07:00`).toISOString();
}
