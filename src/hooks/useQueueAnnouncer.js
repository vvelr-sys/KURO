'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { playChime } from '@/lib/chime';

// ============================================================
// เสียงประกาศเรียกคิว
// 1) เสียง "ติ๊ง-ต่อง" (สร้างด้วย Web Audio ไม่ต้องมีไฟล์เสียง)
// 2) อ่านออกเสียงภาษาไทยด้วย Speech Synthesis ของเบราว์เซอร์ เช่น "ขอเชิญหมายเลขคิว บี ศูนย์ สอง ห้า"
//    ต้องมีเสียงภาษาไทยในเครื่อง (Chrome บน Windows/Android ส่วนใหญ่มี) — ถ้าไม่มีจะได้แค่ติ๊ง-ต่อง
// เปิด/ปิดเสียงจำไว้ในเครื่อง (localStorage) แยกแต่ละเครื่อง
// ============================================================

const STORAGE_KEY = 'kuro.queueAnnouncement';
const LETTER_WORDS = { A: 'เอ', B: 'บี', C: 'ซี' };
const DIGIT_WORDS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];

/**
 * แปลงเลขคิวเป็นคำอ่าน: "B025" → "บี ศูนย์ สอง ห้า" (อ่านทีละตัว ฟังชัดกว่าอ่านเป็นจำนวน)
 * @param {string} queueNumber
 * @returns {string}
 */
export function toSpokenQueueNumber(queueNumber) {
  return [...queueNumber.toUpperCase()]
    .map((character) => LETTER_WORDS[character] ?? DIGIT_WORDS[Number(character)] ?? character)
    .join(' ');
}

// ----- เก็บค่าเปิด/ปิดเสียงใน localStorage แบบที่ React อ่านได้ (useSyncExternalStore) -----
const settingListeners = new Set();
function subscribeSetting(notify) {
  settingListeners.add(notify);
  return () => settingListeners.delete(notify);
}
function readIsEnabled() {
  return window.localStorage.getItem(STORAGE_KEY) !== 'off'; // ค่าเริ่มต้น = เปิด
}
function writeIsEnabled(isEnabled) {
  window.localStorage.setItem(STORAGE_KEY, isEnabled ? 'on' : 'off');
  settingListeners.forEach((notify) => notify());
}

/**
 * hook ประกาศเรียกคิวด้วยเสียง
 * @returns {{
 *   isEnabled: boolean,
 *   setIsEnabled: (isEnabled: boolean) => void,
 *   announce: (queueNumber: string) => Promise<{ spoke: boolean }>
 * }} spoke = false เมื่อเครื่องไม่มีเสียงภาษาไทย (ได้แค่ติ๊ง-ต่อง)
 */
export function useQueueAnnouncer() {
  const isEnabled = useSyncExternalStore(subscribeSetting, readIsEnabled, () => true);
  const thaiVoiceRef = useRef(null);

  // รายชื่อเสียงในเครื่องโหลดแบบไม่พร้อมกัน → หาเสียงไทยตอนโหลดเสร็จ
  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    const findThaiVoice = () => {
      thaiVoiceRef.current =
        window.speechSynthesis.getVoices().find((voice) => voice.lang?.toLowerCase().startsWith('th')) ?? null;
    };
    findThaiVoice();
    window.speechSynthesis.addEventListener('voiceschanged', findThaiVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', findThaiVoice);
  }, []);

  const announce = useCallback(
    async (queueNumber) => {
      if (!readIsEnabled()) return { spoke: true };

      await playChime();

      const thaiVoice = thaiVoiceRef.current;
      if (!thaiVoice || !('speechSynthesis' in window)) return { spoke: false };

      // ประกาศ 2 รอบ ให้ลูกค้าที่รออยู่ได้ยินชัด
      const sentence = `ขอเชิญหมายเลขคิว ${toSpokenQueueNumber(queueNumber)} ค่ะ`;
      window.speechSynthesis.cancel(); // ตัดประกาศเก่าที่ค้างอยู่
      for (let round = 0; round < 2; round += 1) {
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.voice = thaiVoice;
        utterance.lang = thaiVoice.lang;
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
      return { spoke: true };
    },
    []
  );

  return { isEnabled, setIsEnabled: writeIsEnabled, announce };
}
