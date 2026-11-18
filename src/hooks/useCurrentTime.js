'use client';

import { useSyncExternalStore } from 'react';

// ============================================================
// Centralized Timer (ตัวจับเวลากลาง)
// ทั้งแอปมี setInterval แค่ "ตัวเดียว" ไม่ว่าจะมีนาฬิกา/ตัวนับเวลาโต๊ะกี่ตัวก็ตาม
// ทุก Component ที่เรียก useCurrentTime() จะได้เวลาเดียวกัน อัปเดตพร้อมกันทุก 1 วินาที
// และ interval จะหยุดเองเมื่อไม่มี Component ใช้งานแล้ว (ประหยัด CPU แท็บเล็ต)
// ============================================================

/** @type {Set<() => void>} */
const listeners = new Set();
let currentTime = 0;
let intervalId = null;

function tick() {
  currentTime = Date.now();
  listeners.forEach((notify) => notify());
}

/** @param {() => void} notify */
function subscribe(notify) {
  listeners.add(notify);
  if (listeners.size === 1) {
    currentTime = Date.now();
    intervalId = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return currentTime;
}

// ฝั่ง Server ไม่มีเวลา "ตอนนี้" ที่ตรงกับเครื่องลูกค้า → คืน null ให้หน้าเว็บแสดงค่าว่างก่อน
function getServerSnapshot() {
  return null;
}

/**
 * เวลาปัจจุบัน (milliseconds) อัปเดตทุก 1 วินาที จากตัวจับเวลากลางตัวเดียว
 * คืน null ระหว่างโหลดหน้าครั้งแรก (ยังไม่รู้เวลาเครื่องผู้ใช้)
 * @returns {number | null}
 */
export function useCurrentTime() {
  const time = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return time || null;
}

/**
 * ใช้ตัวจับเวลากลางแต่ "render ใหม่เฉพาะเมื่อผลลัพธ์เปลี่ยน"
 * เช่น การ์ดโต๊ะอยากรู้แค่ว่า "ใกล้หมดเวลาหรือยัง" → render ใหม่ครั้งเดียวตอนสถานะเปลี่ยน ไม่ใช่ทุกวินาที
 * @template T
 * @param {(now: number|null) => T} select - ฟังก์ชันแปลงเวลาเป็นค่าที่ต้องการ (ต้องคืนค่า primitive เช่น string/number)
 * @returns {T}
 */
export function useCurrentTimeSelector(select) {
  return useSyncExternalStore(
    subscribe,
    () => select(currentTime || null),
    () => select(null)
  );
}
