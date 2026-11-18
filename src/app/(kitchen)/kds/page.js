"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Layers, List } from "lucide-react";
import {
  StationFilter,
  OrderTicketCard,
  ConsolidatedPrepList,
} from "@/components/kitchen";
import { useKitchenRealtime } from "@/hooks/useKitchenRealtime";
import { getKitchenOrders } from "./actions";
import { cn } from "@/lib/utils";

/**
 * หน้าจอ KDS (Kitchen Display System)
 * ใช้แสดงรายการออเดอร์ในครัว เชื่อมต่อฐานข้อมูล Supabase แบบ Real-time
 */
export default function KDSPage() {
  // สถานีครัวที่เลือก (null = ดูทุกสถานี)
  const [selectedStation, setSelectedStation] = useState(null);

  // มุมมอง: 'ticket' (ดูตามโต๊ะ) หรือ 'prep' (ดูรายการของที่ต้องเตรียมรวม)
  const [viewMode, setViewMode] = useState('ticket');

  // รายการออเดอร์ทั้งหมด
  const [orders, setOrders] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // เวลาปัจจุบัน (อัปเดตทุก 1 วินาที เพื่อคำนวณเวลารอของแต่ละโต๊ะ)
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // ฟังก์ชันโหลดข้อมูลออเดอร์จากฐานข้อมูล
  const loadOrdersFromDatabase = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    try {
      const { orders: fetchedOrders, error } = await getKitchenOrders(selectedStation);
      setOrders(fetchedOrders || []);
      setErrorMessage(error);
    } catch {
      setErrorMessage('เกิดข้อผิดพลาดในการโหลดข้อมูลออเดอร์');
    } finally {
      setIsLoading(false);
      if (isManualRefresh) setIsRefreshing(false);
    }
  }, [selectedStation]);

  // โหลดข้อมูลครั้งแรกเมื่อเปิดหน้า หรือเมื่อเปลี่ยนสถานีครัว
  useEffect(() => {
    let isCurrentPage = true;
    getKitchenOrders(selectedStation).then(({ orders: fetchedOrders, error }) => {
      if (!isCurrentPage) return;
      setOrders(fetchedOrders || []);
      setErrorMessage(error);
      setIsLoading(false);
    });
    return () => {
      isCurrentPage = false;
    };
  }, [selectedStation]);

  // ดักฟังสัญญาณ Real-time เมื่อมีลูกค้าสั่งอาหารเข้ามาใหม่
  useKitchenRealtime({
    station: selectedStation,
    onNewOrder: () => loadOrdersFromDatabase(false),
    onOrderChange: () => loadOrdersFromDatabase(false),
    onMenuChange: () => loadOrdersFromDatabase(false),
  });

  // เมื่อผู้ใช้เลือกเปลี่ยนสถานีครัว
  const handleSelectStation = useCallback((station) => {
    setSelectedStation(station);
    setIsLoading(true);
  }, []);

  // เมื่อสถานะอาหารเปลี่ยน (เช่น ติ๊กเสร็จ หรือ กดยกเลิก) ให้โหลดข้อมูลใหม่
  const handleOrderStatusChanged = useCallback(() => {
    loadOrdersFromDatabase(false);
  }, [loadOrdersFromDatabase]);

  // นับจำนวนโต๊ะที่ยังมีอาหารรอทำอยู่
  const waitingTablesCount = orders.filter((order) =>
    order.items.some((dish) => dish.status === 'pending' || dish.status === 'cooking')
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── แถบด้านบน ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* ชื่อหน้าและจำนวนโต๊ะที่รอ */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span>🍲</span> จอครัว KDS
            </h1>
            {waitingTablesCount > 0 ? (
              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full border border-orange-200">
                รอทำ {waitingTablesCount} โต๊ะ
              </span>
            ) : (
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full">
                ไม่มีออเดอร์ค้าง
              </span>
            )}
          </div>

          {/* สลับมุมมอง & ปุ่มกดรีเฟรช */}
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() => setViewMode("ticket")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "ticket"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800",
                )}
              >
                <List size={14} />
                <span>ตามโต๊ะ</span>
              </button>
              <button
                onClick={() => setViewMode("prep")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "prep"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800",
                )}
              >
                <Layers size={14} />
                <span>รวมทั้งหมด</span>
              </button>
            </div>

            <button
              onClick={() => loadOrdersFromDatabase(true)}
              disabled={isLoading || isRefreshing}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
              title="รีเฟรชข้อมูลจากฐานข้อมูล"
            >
              <RefreshCw
                size={16}
                className={cn(isRefreshing && "animate-spin")}
              />
            </button>
          </div>
        </div>

        {/* แถบเลือกสถานีครัว */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <StationFilter
            selectedStation={selectedStation}
            onSelect={handleSelectStation}
          />
        </div>
      </header>

      {/* ── ส่วนแสดงเนื้อหาหลัก ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4">
        {/* กำลังโหลดข้อมูล */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin mb-3" />
            <p className="text-sm">กำลังโหลดข้อมูลจากฐานข้อมูล...</p>
          </div>
        )}

        {/* กรณีเกิดข้อผิดพลาดในการโหลด */}
        {!isLoading && errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-md mx-auto my-12">
            <span className="text-3xl block mb-2">⚠️</span>
            <p className="text-sm font-semibold text-red-700 mb-4">{errorMessage}</p>
            <button
              onClick={() => loadOrdersFromDatabase(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              ลองเชื่อมต่อใหม่
            </button>
          </div>
        )}

        {/* กรณีไม่มีออเดอร์รอทำเลย */}
        {!isLoading && !errorMessage && orders.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center max-w-lg mx-auto my-12 bg-white">
            <span className="text-5xl block mb-3">🍳</span>
            <h3 className="text-base font-bold text-gray-800">
              ไม่มีออเดอร์ที่รอทำในขณะนี้
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              เมื่อมีลูกค้าสั่งอาหารผ่าน QR โต๊ะ
              ข้อมูลจะปรากฏขึ้นที่นี่โดยอัตโนมัติ (Real-time)
            </p>
          </div>
        )}

        {/* มุมมองที่ 1: แสดงแยกตามแต่ละโต๊ะ (Ticket View) */}
        {!isLoading && !errorMessage && orders.length > 0 && viewMode === 'ticket' && (
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderTicketCard
                key={order.order_id}
                order={order}
                nowTimestamp={currentTime}
                onStatusChange={handleOrderStatusChanged}
              />
            ))}
          </div>
        )}

        {/* มุมมองที่ 2: แสดงรวมรายการของที่ต้องเตรียม (Prep View) */}
        {!isLoading && !errorMessage && orders.length > 0 && viewMode === 'prep' && (
          <ConsolidatedPrepList orders={orders} />
        )}
      </main>
    </div>
  );
}
