import { Suspense } from 'react';
import { InventoryWorkspace } from '@/components/stock';
import { PageSkeleton } from '@/components/layout';
import { requireRole } from '@/lib/auth';
import {
  emergencyAdjustStock,
  getBomData,
  getIngredients,
  getPendingStockCounts,
  getStockMovements,
  getTodayStockSummary,
  reviewStockCount,
  saveIngredient,
  saveMenuBom,
} from './actions';

export const metadata = { title: 'สต็อกวัตถุดิบ | KURO SHABU POS' };

// Server Action ทั้งหมดของหน้านี้ (ส่งให้ Client Component เรียกใช้)
const INVENTORY_ACTIONS = {
  getTodayStockSummary,
  getPendingStockCounts,
  reviewStockCount,
  getIngredients,
  saveIngredient,
  getBomData,
  saveMenuBom,
  getStockMovements,
  emergencyAdjustStock,
};

/**
 * หน้า 4.4 สต็อก (manager, admin — admin อนุมัติ/ปรับฉุกเฉินได้เฉพาะ Emergency พร้อมเหตุผล)
 * ภาพรวมวันนี้ · วัตถุดิบ (FR-030, FR-034) · สูตร BOM (FR-031) · ประวัติความเคลื่อนไหว (FR-033)
 */
export default function InventoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InventoryContent />
    </Suspense>
  );
}

async function InventoryContent() {
  const staff = await requireRole('/inventory');
  return <InventoryWorkspace staffRole={staff.role} actions={INVENTORY_ACTIONS} />;
}
