'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AlertMessage, Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * หน้าต่างย้ายโต๊ะ: เลือกโต๊ะว่างปลายทาง (โต๊ะเดิมจะเปลี่ยนเป็น "รอเก็บโต๊ะ")
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem} props.fromTable
 * @param {import('@/app/(pos)/tables/data').TableItem[]} props.availableTables - โต๊ะว่างทั้งหมด
 * @param {() => void} props.onClose
 * @param {(toTable: import('@/app/(pos)/tables/data').TableItem) => Promise<string|null>} props.onSubmit - คืน error หรือ null
 */
export default function MoveTableDialog({ fromTable, availableTables, onClose, onSubmit }) {
  const [targetTableId, setTargetTableId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const guestCount = fromTable.session ? fromTable.session.adultCount + fromTable.session.childCount : 0;
  const targetTable = availableTables.find((table) => table.id === targetTableId) ?? null;

  const handleSubmit = async () => {
    if (!targetTable) return;
    setIsSaving(true);
    setErrorMessage(null);
    const error = await onSubmit(targetTable);
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
      title={`ย้ายโต๊ะ ${fromTable.tableNumber}`}
      description={`ลูกค้า ${guestCount} ท่าน · โต๊ะเดิมจะเปลี่ยนเป็น "รอเก็บโต๊ะ"`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button className="flex-[2]" onClick={handleSubmit} isLoading={isSaving} disabled={!targetTable}>
            {targetTable ? (
              <>
                {fromTable.tableNumber} <ArrowRight className="size-5" aria-hidden /> {targetTable.tableNumber}
              </>
            ) : (
              'เลือกโต๊ะปลายทาง'
            )}
          </Button>
        </>
      }
    >
      {availableTables.length === 0 ? (
        <AlertMessage>ตอนนี้ไม่มีโต๊ะว่าง</AlertMessage>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {availableTables.map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => setTargetTableId(table.id)}
              aria-pressed={targetTableId === table.id}
              className={cn(
                'flex flex-col items-center rounded-2xl px-2 py-3 ring-1 transition-colors',
                targetTableId === table.id ? 'bg-primary text-white ring-primary' : 'bg-white ring-line hover:bg-primary/5',
                table.capacity < guestCount && targetTableId !== table.id && 'text-ink-muted'
              )}
            >
              <span className="text-xl font-bold">{table.tableNumber}</span>
              <span className="text-xs">{table.capacity} ที่นั่ง</span>
            </button>
          ))}
        </div>
      )}
      <AlertMessage className="mt-4">{errorMessage}</AlertMessage>
    </Modal>
  );
}
