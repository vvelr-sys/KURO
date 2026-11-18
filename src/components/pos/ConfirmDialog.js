'use client';

import { useState } from 'react';
import { AlertMessage, Button, Modal } from '@/components/ui';

/**
 * หน้าต่างยืนยันก่อนทำรายการ (มีช่องเหตุผลได้ถ้าต้องการ)
 * @param {Object} props
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} props.confirmLabel
 * @param {'primary'|'danger'|'success'} [props.confirmVariant='primary']
 * @param {string} [props.reasonLabel] - ถ้าใส่ จะมีช่องกรอกเหตุผล (ไม่บังคับ)
 * @param {() => void} props.onClose
 * @param {(reason: string) => Promise<string|null>} props.onConfirm - คืน error หรือ null
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  reasonLabel,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleConfirm = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    const error = await onConfirm(reason);
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
      title={title}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </Button>
          <Button variant={confirmVariant} className="flex-1" onClick={handleConfirm} isLoading={isSaving}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-ink-muted">{message}</p>
      {reasonLabel && (
        <label className="mt-4 flex flex-col gap-2">
          <span className="font-semibold">{reasonLabel}</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            className="h-12 rounded-xl border border-line px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
      )}
      <AlertMessage className="mt-4">{errorMessage}</AlertMessage>
    </Modal>
  );
}
