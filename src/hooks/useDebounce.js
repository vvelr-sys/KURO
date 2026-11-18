'use client';

import { useEffect, useState } from 'react';

/**
 * หน่วงค่าไว้จนกว่าผู้ใช้หยุดพิมพ์ (ใช้กับช่องค้นหา ไม่ให้กรองข้อมูลใหม่ทุกตัวอักษร)
 * @template T
 * @param {T} value - ค่าล่าสุด
 * @param {number} [delayMs=200] - ระยะเวลาที่ต้องหยุดพิมพ์ก่อนอัปเดต (AGENTS: 150-200ms)
 * @returns {T} ค่าที่หน่วงแล้ว
 */
export function useDebounce(value, delayMs = 200) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timerId);
  }, [value, delayMs]);

  return debouncedValue;
}
