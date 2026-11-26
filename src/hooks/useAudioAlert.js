'use client';

import { useRef, useState, useCallback } from 'react';

/**
 * Hook สำหรับเล่นเสียงแจ้งเตือนเมื่อมีออเดอร์ใหม่เข้าครัว
 * ใช้ Web Audio API สร้างเสียงแบบ Programmatic (ไม่ต้องใช้ไฟล์เสียง)
 *
 * @returns {{ playAlert: () => void, soundEnabled: boolean, toggleSound: () => void }}
 */
export function useAudioAlert() {
  // เก็บ AudioContext ไว้ใน ref เพื่อไม่ให้ re-create ทุก render
  const audioContextRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);

  const getContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  /**
   * เล่นเสียง Beep 2 ครั้ง (ไม่เล่นถ้าปิดเสียงไว้)
   */
  const playAlert = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = getContext();

      const beep = (startTime, frequency, duration, volume) => {
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
      beep(now, 880, 0.15, 0.4);
      beep(now + 0.2, 1100, 0.15, 0.3);
    } catch (err) {
      // ถ้าเสียงไม่ทำงาน (เช่น ยังไม่มี User Gesture) ให้ข้ามไปเงียบๆ
      console.warn('[useAudioAlert] ไม่สามารถเล่นเสียงได้:', err.message);
    }
  }, []);

  /**
   * เปิด/ปิดเสียงแจ้งเตือน
   * การกดปุ่มนี้ถือเป็น User Gesture จึงปลดล็อก AudioContext ของเบราว์เซอร์ไปด้วย
   */
  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    if (next) {
      try {
        getContext().resume();
      } catch {
        // ไม่ต้องทำอะไร
      }
    }
  }, []);

  return { playAlert, soundEnabled, toggleSound };
}
