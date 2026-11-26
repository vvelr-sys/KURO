'use client';

import { useState } from 'react';
import { BookOpen, ClipboardCheck, History, LayoutDashboard, Package } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import InventoryScreen from './InventoryScreen';
import IngredientManager from './IngredientManager';
import BomEditor from './BomEditor';
import MovementHistory from './MovementHistory';

const TABS = [
  { key: 'today', label: 'ภาพรวมวันนี้', icon: LayoutDashboard },
  { key: 'ingredients', label: 'วัตถุดิบ', icon: Package },
  { key: 'bom', label: 'สูตรตัดสต็อก (BOM)', icon: BookOpen },
  { key: 'history', label: 'ประวัติความเคลื่อนไหว', icon: History },
];

/**
 * หน้า 4.4 สต็อก (Manager / Admin) — แบ่งเป็นแท็บ
 * ภาพรวมวันนี้ (อนุมัติผลนับ + สรุป + กราฟ) · วัตถุดิบ · สูตร BOM · ประวัติ
 * Server Action ทั้งหมดส่งมาจาก page.js (Component ไม่ผูกกับโฟลเดอร์ route)
 *
 * @param {object} props
 * @param {string} props.staffRole
 * @param {Record<string, Function>} props.actions
 */
export default function InventoryWorkspace({ staffRole, actions }) {
  const [activeTab, setActiveTab] = useState('today');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">สต็อกวัตถุดิบ</h1>
        {/* รับของเข้า / ของเสีย / นับสต็อก ทำที่หน้าเดียวกับ Staff */}
        <Link
          href="/stock-count"
          className="ml-auto flex h-11 items-center gap-2 rounded-full bg-white px-4 font-semibold shadow-sm hover:bg-surface"
        >
          <ClipboardCheck className="size-5" aria-hidden />
          นับสต็อก / รับของเข้า / ของเสีย
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 rounded-3xl bg-white p-3 shadow-sm" role="tablist" aria-label="เลือกส่วนของหน้าสต็อก">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition-colors',
              activeTab === key ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'today' && (
        <InventoryScreen
          staffRole={staffRole}
          loadSummaryAction={actions.getTodayStockSummary}
          loadPendingAction={actions.getPendingStockCounts}
          reviewAction={actions.reviewStockCount}
        />
      )}
      {activeTab === 'ingredients' && (
        <IngredientManager
          staffRole={staffRole}
          loadAction={actions.getIngredients}
          saveAction={actions.saveIngredient}
          adjustAction={actions.emergencyAdjustStock}
        />
      )}
      {activeTab === 'bom' && <BomEditor loadAction={actions.getBomData} saveAction={actions.saveMenuBom} />}
      {activeTab === 'history' && (
        <MovementHistory loadIngredientsAction={actions.getIngredients} loadMovementsAction={actions.getStockMovements} />
      )}
    </div>
  );
}
