'use client';

import { useMemo, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatExtraPrice } from './cart';

/**
 * จัดกลุ่มตัวเลือกตามชื่อกลุ่ม (เช่น "น้ำจิ้ม" → [สุกี้, งา, ซีฟู้ด])
 * @param {import('@/app/order/[tableNumber]/data').MenuOption[]} options
 * @returns {{ groupName: string, options: import('@/app/order/[tableNumber]/data').MenuOption[] }[]}
 */
function groupOptions(options) {
  const groups = new Map();
  for (const option of options) {
    if (!groups.has(option.groupName)) groups.set(option.groupName, []);
    groups.get(option.groupName).push(option);
  }
  return [...groups].map(([groupName, groupOptionsList]) => ({ groupName, options: groupOptionsList }));
}

/**
 * หน้าต่างเลือกตัวเลือกก่อนใส่ตะกร้า — เลือกกลุ่มละ 1 อย่าง (เลือกตัวแรกให้ก่อน กดใส่ตะกร้าได้ทันที)
 * ฐานข้อมูลตรวจซ้ำว่าเลือกครบทุกกลุ่ม (fn_customer_place_order)
 * Component นี้ถูกสร้างใหม่ทุกครั้งที่เปิด (key = เมนู) → ค่าที่เลือกเริ่มใหม่เสมอ
 * @param {Object} props
 * @param {import('@/app/order/[tableNumber]/data').CustomerMenuItem} props.item
 * @param {() => void} props.onClose
 * @param {(optionIds: string[], optionLabel: string) => void} props.onConfirm
 */
export default function OptionPickerModal({ item, onClose, onConfirm }) {
  const groups = useMemo(() => groupOptions(item.options), [item.options]);
  const [selectedByGroup, setSelectedByGroup] = useState(() =>
    Object.fromEntries(groups.map((group) => [group.groupName, group.options[0].id]))
  );

  const handleConfirm = () => {
    const chosen = groups.map((group) => group.options.find((option) => option.id === selectedByGroup[group.groupName]));
    onConfirm(
      chosen.map((option) => option.id),
      chosen.map((option) => option.name).join(', ')
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={item.name}
      description="เลือกกลุ่มละ 1 อย่าง"
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button className="flex-1" onClick={handleConfirm}>
            ใส่ตะกร้า
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <fieldset key={group.groupName} className="flex flex-col gap-2">
            <legend className="mb-2 font-bold">{group.groupName}</legend>
            {group.options.map((option) => {
              const isSelected = selectedByGroup[group.groupName] === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3',
                    isSelected ? 'border-primary bg-primary/5' : 'border-line'
                  )}
                >
                  <input
                    type="radio"
                    name={group.groupName}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => setSelectedByGroup((current) => ({ ...current, [group.groupName]: option.id }))}
                    className="size-5 accent-primary"
                  />
                  <span className="flex-1 font-semibold">{option.name}</span>
                  {option.additionalPrice > 0 && (
                    <span className="text-sm font-bold text-amber-800">{formatExtraPrice(option.additionalPrice)}</span>
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
