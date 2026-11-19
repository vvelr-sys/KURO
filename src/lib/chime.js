// เสียงเตือน "ติ๊ง-ต่อง" สร้างด้วย Web Audio (ไม่ต้องมีไฟล์เสียง) — ใช้ฝั่งเบราว์เซอร์เท่านั้น
// ใช้ในหน้าคิว (ก่อนประกาศเรียกคิว) และหน้าเรียกพนักงาน (มีคำขอใหม่)
// ⚠️ เบราว์เซอร์จะเล่นเสียงได้หลังผู้ใช้กด/แตะหน้าเว็บอย่างน้อย 1 ครั้ง (นโยบาย autoplay)

/** เล่นเสียงติ๊ง-ต่อง 2 โน้ต (คืน Promise ที่จบเมื่อเสียงจบ) */
export function playChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return Promise.resolve();
  const audioContext = new AudioContextClass();
  const notes = [
    { frequency: 880, startAt: 0 },
    { frequency: 659, startAt: 0.35 },
  ];
  for (const { frequency, startAt } of notes) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime + startAt);
    gain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + startAt + 0.6);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(audioContext.currentTime + startAt);
    oscillator.stop(audioContext.currentTime + startAt + 0.65);
  }
  return new Promise((resolve) =>
    setTimeout(() => {
      audioContext.close();
      resolve();
    }, 1000)
  );
}

