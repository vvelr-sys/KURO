'use client';

import { useRef, useCallback } from 'react';

/**
 * Hook สำหรับเล่นเสียงแจ้งเตือนเมื่อมีออเดอร์ใหม่เข้าครัว
 * ใช้ Web Audio API เพื่อสร้างเสียงแบบ Programmatic (ไม่ต้องใช้ไฟล์เสียง)
 *
 * @returns {{ playAlert: () => void }}
 */
export function useAudioAlert() {
  // เก็บ AudioContext ไว้ใน ref เพื่อไม่ให้ re-create ทุก render
  const audioContextRef = useRef(null);

  /**
   * เล่นเสียง Beep 2 ครั้ง (ดัง-เบา)
   * เรียกใช้เมื่อมีออเดอร์ใหม่เข้า
   */
  const playAlert = useCallback(() => {
    try {
      // สร้าง AudioContext ครั้งแรกที่ใช้งาน (ต้องรอ User Gesture ก่อน)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      // ฟังก์ชันสร้างเสียง Beep ครั้งเดียว
      const beep = (startTime, frequency = 880, duration = 0.15, volume = 0.4) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);

        // Fade in-out เพื่อกัน Click noise
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      // เสียง Beep 2 ครั้ง ห่างกัน 0.2 วินาที
      beep(now, 880, 0.15, 0.4);
      beep(now + 0.2, 1100, 0.15, 0.3);
    } catch (err) {
      // ถ้าเสียงไม่ทำงาน (เช่น ไม่มี User Gesture) ให้ข้ามไปเงียบๆ
      console.warn('[useAudioAlert] ไม่สามารถเล่นเสียงได้:', err.message);
    }
  }, []);

  return { playAlert };
}
