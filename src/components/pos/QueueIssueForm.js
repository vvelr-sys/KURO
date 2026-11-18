'use client';

import { useState } from 'react';
import { CircleCheck, Printer, Ticket } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { TABLE_SIZES, getTableSizeKey } from '@/lib/constants';
import { cn } from '@/lib/utils';
import GuestStepper from './GuestStepper';

/**
 * ฟอร์มออกบัตรคิว (ตาม Figma): ผู้ใหญ่/เด็ก → ระบบเลือกขนาดโต๊ะให้ (แคชเชียร์กดเปลี่ยนได้) → พิมพ์บัตร
 * @param {Object} props
 * @param {Record<string, number>} props.waitingCountBySize - จำนวนคิวที่รอ แยกตามขนาด
 * @param {(input: { adultCount: number, childCount: number, tableSize: string }) => Promise<string|null>} props.onIssue - คืน error หรือ null
 */
export default function QueueIssueForm({ waitingCountBySize, onIssue }) {
  const [adultCount, setAdultCount] = useState(2);
  const [childCount, setChildCount] = useState(0);
  // null = ใช้ขนาดที่ระบบเลือกให้ / มีค่า = แคชเชียร์เลือกเอง
  const [chosenSize, setChosenSize] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const totalGuests = adultCount + childCount;
  const suggestedSize = getTableSizeKey(Math.max(1, totalGuests));
  const tableSize = chosenSize ?? suggestedSize;
  const nextQueuePrefix = TABLE_SIZES.find((size) => size.key === tableSize)?.queuePrefix;

  const handleIssue = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    const error = await onIssue({ adultCount, childCount, tableSize });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error);
      return;
    }
    // ออกคิวสำเร็จ → พร้อมรับลูกค้าคนถัดไป
    setAdultCount(2);
    setChildCount(0);
    setChosenSize(null);
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Ticket className="size-6 text-primary" aria-hidden />
        ออกบัตรคิวใหม่
      </h2>

      <GuestStepper label="ผู้ใหญ่" value={adultCount} onChange={setAdultCount} />
      <GuestStepper label="เด็ก" hint="ส่วนสูงต่ำกว่า 120 ซม." value={childCount} onChange={setChildCount} />

      <p className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
        <span className="text-ink-muted">รวม</span>
        <span className="text-xl font-bold text-primary">
          {totalGuests} ท่าน
          <span className="ml-1 text-base font-normal text-ink-muted">
            (ผู้ใหญ่ {adultCount}
            {childCount > 0 && `, เด็ก ${childCount}`})
          </span>
        </span>
      </p>

      <div className="flex flex-col gap-2">
        <p className="font-semibold">ขนาดโต๊ะ</p>
        <div className="grid grid-cols-3 gap-2">
          {TABLE_SIZES.map((size) => (
            <button
              key={size.key}
              type="button"
              onClick={() => setChosenSize(size.key === suggestedSize ? null : size.key)}
              aria-pressed={tableSize === size.key}
              className={cn(
                'flex flex-col items-start rounded-2xl p-3 text-left ring-1 transition-colors',
                tableSize === size.key ? 'bg-primary text-white ring-primary' : 'bg-white ring-line hover:bg-primary/5'
              )}
            >
              <span className="flex w-full items-center justify-between font-bold">
                {size.queuePrefix} · {size.label}
                {size.key === suggestedSize && <CircleCheck className="size-4" aria-label="ระบบแนะนำ" />}
              </span>
              <span className="text-sm opacity-80">{size.seatLabel}</span>
              <span className="text-sm opacity-80">รอ {waitingCountBySize[size.key] ?? 0} คิว</span>
            </button>
          ))}
        </div>
        {chosenSize && (
          <p className="text-sm text-amber-700">เลือกขนาดเอง (ระบบแนะนำตามจำนวนคน: กดที่ขนาดที่มีเครื่องหมายถูกเพื่อกลับไปใช้)</p>
        )}
      </div>

      <AlertMessage>{errorMessage}</AlertMessage>

      <Button size="lg" icon={Printer} onClick={handleIssue} isLoading={isSaving} disabled={totalGuests < 1}>
        พิมพ์บัตรคิว ({nextQueuePrefix})
      </Button>
    </section>
  );
}
