'use client';

import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { AlertMessage, Button, Modal } from '@/components/ui';
import { cn, formatCurrency } from '@/lib/utils';
import GuestStepper from './GuestStepper';

/**
 * หน้าต่างเปิดโต๊ะ: กรอกผู้ใหญ่/เด็ก (หรือเลือกจากคิวที่เรียกแล้ว) แล้วเปิดรอบ
 * ปิดแล้ว state ภายในหายไปเอง (Component ถูก unmount) — เปิดใหม่เริ่มที่ค่าเริ่มต้นเสมอ
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem} props.table
 * @param {import('@/app/(pos)/tables/data').CalledQueue[]} props.calledQueues
 * @param {{ name: string, adultPrice: number, childPrice: number, durationMinutes: number } | null} props.activePackage
 * @param {() => void} props.onClose
 * @param {(input: { adultCount: number, childCount: number, queueId: string|null }) => Promise<string|null>} props.onSubmit - คืนข้อความ error หรือ null
 */
export default function OpenTableDialog({ table, calledQueues, activePackage, onClose, onSubmit }) {
  const [adultCount, setAdultCount] = useState(Math.min(2, table.capacity));
  const [childCount, setChildCount] = useState(0);
  const [selectedQueueId, setSelectedQueueId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const totalGuests = adultCount + childCount;
  const isOverCapacity = totalGuests > table.capacity;
  const buffetTotal = activePackage
    ? adultCount * activePackage.adultPrice + childCount * activePackage.childPrice
    : 0;

  /** เลือกคิว → กรอกจำนวนลูกค้าตามบัตรคิวให้อัตโนมัติ (กดซ้ำ = ยกเลิกการเลือก) */
  const handleSelectQueue = (queue) => {
    if (selectedQueueId === queue.id) {
      setSelectedQueueId(null);
      return;
    }
    setSelectedQueueId(queue.id);
    setAdultCount(queue.adultCount);
    setChildCount(queue.childCount);
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    const error = await onSubmit({ adultCount, childCount, queueId: selectedQueueId });
    // สำเร็จ → หน้าหลักปิดหน้าต่างนี้และเปิดหน้าต่าง QR แทน
    if (error) {
      setErrorMessage(error);
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      isCloseDisabled={isSaving}
      title={`เปิดโต๊ะ ${table.tableNumber}`}
      description={`${table.capacity} ที่นั่ง · เริ่มนับเวลาทันทีที่กดเปิด`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button
            variant="success"
            className="flex-[2]"
            onClick={handleSubmit}
            isLoading={isSaving}
            disabled={!activePackage || totalGuests < 1}
          >
            เปิดโต๊ะ ({totalGuests} ท่าน)
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {calledQueues.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">เปิดจากคิวที่เรียกแล้ว (ไม่บังคับ)</p>
            <div className="flex flex-wrap gap-2">
              {calledQueues.map((queue) => (
                <button
                  key={queue.id}
                  type="button"
                  onClick={() => handleSelectQueue(queue)}
                  aria-pressed={selectedQueueId === queue.id}
                  className={cn(
                    'rounded-xl px-4 py-2 text-left font-semibold ring-1 transition-colors',
                    selectedQueueId === queue.id
                      ? 'bg-primary text-white ring-primary'
                      : 'bg-white text-ink ring-line hover:bg-primary/5'
                  )}
                >
                  {queue.queueNumber}
                  <span className="ml-2 text-sm font-normal opacity-80">
                    ผญ {queue.adultCount} / ด {queue.childCount}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <GuestStepper label="ผู้ใหญ่" value={adultCount} onChange={setAdultCount} />
        <GuestStepper label="เด็ก" hint="ส่วนสูงต่ำกว่า 120 ซม." value={childCount} onChange={setChildCount} />

        {isOverCapacity && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            ลูกค้า {totalGuests} ท่าน เกินที่นั่งของโต๊ะ ({table.capacity} ที่นั่ง) — สอบถามลูกค้าก่อนเปิด
          </p>
        )}

        {activePackage ? (
          <div className="flex items-center justify-between rounded-2xl bg-primary/5 px-4 py-3">
            <div className="text-sm text-ink-muted">
              <p className="font-semibold text-ink">{activePackage.name}</p>
              <p>
                ผู้ใหญ่ {formatCurrency(activePackage.adultPrice)} · เด็ก {formatCurrency(activePackage.childPrice)} ·{' '}
                {activePackage.durationMinutes} นาที
              </p>
            </div>
            <p className="text-xl font-bold text-primary">{formatCurrency(buffetTotal)}</p>
          </div>
        ) : (
          <AlertMessage>ยังไม่มีแพ็กเกจที่เปิดใช้งาน (ต้องมี 1 รายการพอดี) กรุณาติดต่อผู้ดูแลระบบ</AlertMessage>
        )}

        <AlertMessage>{errorMessage}</AlertMessage>
      </div>
    </Modal>
  );
}
