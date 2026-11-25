'use client';

import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { IMAGE_TYPES } from '@/hooks/useImageUpload';
import Button from './Button';
import MenuImage from './MenuImage';

/**
 * ช่องเลือกรูป: ภาพตัวอย่าง + ปุ่มเลือก/เปลี่ยน/เอาออก (ใช้คู่กับ useImageUpload)
 * @param {Object} props
 * @param {ReturnType<typeof import('@/hooks/useImageUpload').useImageUpload>} props.upload
 * @param {boolean} [props.isDisabled]
 * @param {string|null} [props.error] - error จากฝั่งเซิร์ฟเวอร์ (ถ้ามี)
 */
export default function ImagePickerField({ upload, isDisabled = false, error = null }) {
  const fileInputRef = useRef(null);
  const isBusy = isDisabled || upload.isUploading;
  const message = upload.uploadError ?? error;

  return (
    <div className="flex items-start gap-4">
      <MenuImage src={upload.imageUrl} alt="รูปตัวอย่าง" className="size-28" />
      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          onChange={(event) => {
            upload.uploadFile(event.target.files?.[0]);
            event.target.value = '';
          }}
          className="hidden"
        />
        <Button variant="secondary" size="sm" icon={ImagePlus} isLoading={upload.isUploading} disabled={isBusy} onClick={() => fileInputRef.current?.click()}>
          {upload.imageUrl ? 'เปลี่ยนรูป' : 'เลือกรูป'}
        </Button>
        {upload.imageUrl && (
          <Button variant="ghost" size="sm" disabled={isBusy} onClick={upload.removeImage}>
            เอารูปออก
          </Button>
        )}
        <span className="text-xs text-ink-muted">JPG / PNG / WEBP ไม่เกิน 2 MB</span>
        {message && <span className="text-sm font-semibold text-danger">{message}</span>}
      </div>
    </div>
  );
}
