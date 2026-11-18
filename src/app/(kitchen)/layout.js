import { KitchenNav } from '@/components/kitchen';

/**
 * Layout สำหรับ Kitchen Route Group
 * Route: /(kitchen)/*
 * เข้าถึงได้: kitchen, manager, admin
 *
 * มี Navigation Bar ด้านล่างให้สลับระหว่าง จอ KDS กับ จัดการเปิด/ปิดเมนู
 */
export const metadata = {
  title: 'KURO KDS - ระบบครัว',
  description: 'Kitchen Display System สำหรับพนักงานครัว',
};

export default function KitchenLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col pb-24">
      {children}
      {/* แถบเมนูด้านล่างสำหรับคนในครัว */}
      <KitchenNav />
    </div>
  );
}
