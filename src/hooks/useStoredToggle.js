'use client';

import { useCallback, useSyncExternalStore } from 'react';

// สวิตช์เปิด/ปิดที่จำค่าไว้ในเครื่อง (localStorage) — เช่น เปิด/ปิดเสียงเตือนของแต่ละแท็บเล็ต
const listeners = new Set();
function subscribe(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/**
 * @param {string} storageKey - ชื่อคีย์ใน localStorage
 * @param {boolean} defaultValue - ค่าเริ่มต้นถ้ายังไม่เคยตั้ง
 * @returns {[boolean, (nextValue: boolean) => void]}
 */
export function useStoredToggle(storageKey, defaultValue) {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const stored = window.localStorage.getItem(storageKey);
      return stored === null ? defaultValue : stored === 'on';
    },
    () => defaultValue
  );

  const setValue = useCallback(
    (nextValue) => {
      window.localStorage.setItem(storageKey, nextValue ? 'on' : 'off');
      listeners.forEach((notify) => notify());
    },
    [storageKey]
  );

  return [value, setValue];
}
