'use client';

import { useCallback, useRef, useState } from 'react';
import { MENU_IMAGE_BUCKET } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * ชื่อไฟล์สุ่มไม่ซ้ำ — crypto.randomUUID ใช้ได้เฉพาะ https/localhost
 * เปิดผ่าน IP ในวง LAN (http://192.168.x.x) จะไม่มี → ใช้ getRandomValues แทน (มีทุกเบราว์เซอร์)
 * @returns {string}
 */
function makeRandomFileName() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * อัปโหลดรูปเข้า Supabase Storage (bucket menu-images — migration 025) ใช้กับรูปเมนูและรูปวัตถุดิบ
 * - รูปที่อัปโหลดแล้วแต่ "ยังไม่ได้บันทึก" จะถูกลบเมื่อเรียก discardUnsaved() (เช่น ปิดหน้าต่างโดยไม่บันทึก)
 * - บันทึกฟอร์มสำเร็จแล้วให้เรียก markSaved() เพื่อเก็บรูปไว้
 * - การลบรูปเก่าหลังบันทึก ทำฝั่ง Server Action
 *
 * @param {{ initialUrl?: string|null, folder: 'items'|'ingredients' }} options
 */
export function useImageUpload({ initialUrl = null, folder }) {
  const [imageUrl, setImageUrl] = useState(initialUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const unsavedPathRef = useRef(null);

  /** ลบรูปที่อัปโหลดไว้แต่ยังไม่ได้บันทึก */
  const discardUnsaved = useCallback(async () => {
    const path = unsavedPathRef.current;
    unsavedPathRef.current = null;
    if (path) await createClient().storage.from(MENU_IMAGE_BUCKET).remove([path]);
  }, []);

  /** อัปโหลดไฟล์ที่เลือก (ตรวจชนิดและขนาดก่อน) */
  const uploadFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!IMAGE_TYPES.includes(file.type)) {
        setUploadError('ใช้ได้เฉพาะไฟล์ JPG, PNG หรือ WEBP');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError('รูปใหญ่เกิน 2 MB');
        return;
      }

      setIsUploading(true);
      setUploadError(null);
      const supabase = createClient();
      const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
      const path = `${folder}/${makeRandomFileName()}.${extension}`;
      const { error } = await supabase.storage
        .from(MENU_IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      setIsUploading(false);
      if (error) {
        setUploadError('อัปโหลดรูปไม่สำเร็จ (ถ้าเพิ่งอัปเดตระบบ ให้รัน migration ล่าสุดก่อน)');
        return;
      }

      await discardUnsaved();
      unsavedPathRef.current = path;
      setImageUrl(supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
    },
    [folder, discardUnsaved]
  );

  /** เอารูปออก (รูปที่ยังไม่บันทึกลบทันที / รูปเดิมลบตอนบันทึก) */
  const removeImage = useCallback(async () => {
    await discardUnsaved();
    setImageUrl(null);
  }, [discardUnsaved]);

  /** บันทึกฟอร์มสำเร็จ → ไม่ต้องลบรูปที่อัปโหลด */
  const markSaved = useCallback(() => {
    unsavedPathRef.current = null;
  }, []);

  return { imageUrl, isUploading, uploadError, uploadFile, removeImage, discardUnsaved, markSaved };
}
