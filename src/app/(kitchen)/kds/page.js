"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  Layers,
  List,
  Clock,
  Bell,
  Volume2,
  VolumeX,
  RotateCcw,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import {
  StationFilter,
  OrderTicketCard,
  ConsolidatedPrepList,
} from "@/components/kitchen";
import { useKitchenRealtime } from "@/hooks/useKitchenRealtime";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import {
  getKitchenOrders,
  getRecentlyServedOrders,
  recallOrderItem,
} from "./actions";
import { cn } from "@/lib/utils";

/**
 * หน้าจอ KDS (Kitchen Display System) — ธีม KURO SHABU
 * ออกแบบตามต้นแบบแบรนด์คุโระ ชาบู เชื่อมต่อ Supabase Realtime เต็มรูปแบบ
 */
export default function KDSPage() {
  // สถานีครัวที่เลือก (null = ดูทุกสถานี)
  const [selectedStation, setSelectedStation] = useState(null);

  // โหมดมุมมอง: 'ticket' (การ์ดตามโต๊ะ) หรือ 'prep' (รวมรายการเตรียม)
  const [viewMode, setViewMode] = useState("ticket");

  // ข้อมูลออเดอร์
  const [orders, setOrders] = useState([]);
  const [recentlyServed, setRecentlyServed] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ระบบเสียงแจ้งเตือน
  const { playAlert, soundEnabled, toggleSound } = useAudioAlert();
  const [newOrderAlert, setNewOrderAlert] = useState(null);

  // นาฬิกาแบบเรียลไทม์
  const [nowTimestamp, setNowTimestamp] = useState(0);
  const [clockString, setClockString] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowTimestamp(now.getTime());
      setClockString(
        now.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ฟังก์ชันโหลดข้อมูลออเดอร์และรายการ Recall
  const loadOrders = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      try {
        const [ordersRes, recallRes] = await Promise.all([
          getKitchenOrders(selectedStation),
          getRecentlyServedOrders(6),
        ]);

        setOrders(ordersRes.orders || []);
        setRecentlyServed(recallRes.items || []);
        setErrorMessage(ordersRes.error);
      } catch {
        setErrorMessage("เกิดข้อผิดพลาดในการโหลดข้อมูลออเดอร์");
      } finally {
        setIsLoading(false);
        if (isManual) setIsRefreshing(false);
      }
    },
    [selectedStation]
  );

  // โหลดเมื่อเปิดหน้าหรือเปลี่ยนสถานี
  useEffect(() => {
    let isCurrent = true;

    Promise.all([
      getKitchenOrders(selectedStation),
      getRecentlyServedOrders(6),
    ]).then(([ordersRes, recallRes]) => {
      if (!isCurrent) return;
      setOrders(ordersRes.orders || []);
      setRecentlyServed(recallRes.items || []);
      setErrorMessage(ordersRes.error);
      setIsLoading(false);
    });

    return () => {
      isCurrent = false;
    };
  }, [selectedStation]);

  // ดักฟัง Supabase Realtime
  useKitchenRealtime({
    station: selectedStation,
    onNewOrder: (payload) => {
      playAlert();
      setNewOrderAlert({
        id: Date.now(),
        message: `มีออเดอร์ใหม่เพิ่งส่งเข้ามาจากแท็บเล็ตลูกค้า!`,
      });
      loadOrders(false);
    },
    onOrderChange: () => loadOrders(false),
    onMenuChange: () => loadOrders(false),
  });

  // ฟังก์ชันเรียกคืนรายการที่เพิ่งเสิร์ฟ (Recall)
  const handleRecall = async (itemId) => {
    const res = await recallOrderItem(itemId);
    if (res.success) {
      loadOrders(false);
    }
  };

  // ─── คำนวณสรุปสถิติด้านบน (Stats Bar) ──────────────────────────
  const stats = useMemo(() => {
    let waitingCount = 0;
    let cookingCount = 0;
    let overdueCount = 0;
    const stationCounts = { fresh: 0, beverage: 0, grill: 0, hot_kitchen: 0 };

    for (const order of orders) {
      for (const item of order.items) {
        if (item.status === "cancelled") continue;

        if (item.station && stationCounts[item.station] !== undefined) {
          if (item.status === "pending" || item.status === "cooking") {
            stationCounts[item.station] += item.quantity;
          }
        }

        if (item.status === "pending") {
          waitingCount += item.quantity;
        } else if (item.status === "cooking") {
          cookingCount += item.quantity;
        }

        // เช็คเกินเกณฑ์ (> 8 นาที)
        if (item.status === "pending" || item.status === "cooking") {
          const waitSecs = (nowTimestamp - new Date(item.created_at).getTime()) / 1000;
          if (waitSecs > 480) {
            overdueCount += 1;
          }
        }
      }
    }

    return {
      waitingCount,
      cookingCount,
      overdueCount,
      stationCounts,
    };
  }, [orders, nowTimestamp]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 flex flex-col font-sans">
      {/* ═══ 1. แถบหัวเว็บ KURO SHABU (Crimson Bar) ═══ */}
      <header className="bg-[#7F1D1D] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          {/* โลโก้ + สาขา */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shadow-inner">
              🍲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-wide">
                  คุโระ ชาบู (KURO SHABU)
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                  ● ออนไลน์
                </span>
              </div>
              <p className="text-xs text-red-200">สาขาสยามสแควร์วัน ชั้น 4</p>
            </div>
          </div>

          {/* นาฬิกา + ปุ่มระบบเสียง + รีเฟรช */}
          <div className="flex items-center gap-3">
            {/* ดิจิทัลคล็อก */}
            <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-xl border border-white/10">
              <Clock size={16} className="text-red-300" />
              <span className="font-mono font-bold text-sm text-white tracking-wider">
                {clockString || "00:00:00"}
              </span>
            </div>

            {/* ปุ่มเปิด/ปิดเสียง */}
            <button
              onClick={toggleSound}
              className={cn(
                "p-2 rounded-xl border transition-colors",
                soundEnabled
                  ? "bg-white/10 border-white/20 text-white hover:bg-white/20"
                  : "bg-red-950/60 border-red-800 text-red-400"
              )}
              title={soundEnabled ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            {/* ปุ่มรีเฟรช */}
            <button
              onClick={() => loadOrders(true)}
              disabled={isLoading || isRefreshing}
              className="p-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors disabled:opacity-40"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw
                size={18}
                className={cn(isRefreshing && "animate-spin")}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ 2. แถบหัวเรื่อง KDS + ตัวสลับมุมมอง ═══ */}
      <section className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span>ระบบจัดการออเดอร์ครัว KDS (Kitchen Display System)</span>
            </h1>
            <p className="text-xs text-gray-500">
              จอแสดงรายการปรุงและจัดเสิร์ฟอาหารชาบูแบบเรียลไทม์ (FIFO คิวสั่งก่อน-หลัง)
            </p>
          </div>

          {/* ตัวสลับมุมมอง: Ticket View vs Prep View */}
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl self-start md:self-auto border border-gray-200">
            <button
              onClick={() => setViewMode("ticket")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "ticket"
                  ? "bg-[#7F1D1D] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Layers size={14} />
              <span>การ์ดตามโต๊ะ</span>
            </button>
            <button
              onClick={() => setViewMode("prep")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === "prep"
                  ? "bg-[#7F1D1D] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <List size={14} />
              <span>รวมรายการเตรียม</span>
            </button>
          </div>
        </div>

        {/* ═══ แถบสถานีครัว (Station Filter Cards) ═══ */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <StationFilter
            selectedStation={selectedStation}
            onSelect={setSelectedStation}
            orderCountByStation={stats.stationCounts}
          />
        </div>
      </section>

      {/* ═══ 3. แถบสรุปสถิติ (Stats Bar) ═══ */}
      <section className="max-w-7xl mx-auto px-4 pt-4 w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* การ์ด 1: รอทำทั้งหมด */}
          <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
            <span className="text-xs text-gray-500 font-medium block">
              รอทำทั้งหมด
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-gray-900">
                {stats.waitingCount}
              </span>
              <span className="text-xs text-gray-400">รายการ</span>
            </div>
          </div>

          {/* การ์ด 2: กำลังปรุง/สไลด์ */}
          <div className="bg-white border border-orange-200 bg-orange-50/30 rounded-2xl p-3.5 shadow-sm">
            <span className="text-xs text-orange-700 font-bold block">
              กำลังปรุง / สไลด์
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-orange-600">
                {stats.cookingCount}
              </span>
              <span className="text-xs text-orange-400">รายการ</span>
            </div>
          </div>

          {/* การ์ด 3: เกินเกณฑ์ (> 8 นาที) */}
          <div
            className={cn(
              "border rounded-2xl p-3.5 shadow-sm transition-all",
              stats.overdueCount > 0
                ? "bg-red-50 border-red-300"
                : "bg-white border-gray-200"
            )}
          >
            <span
              className={cn(
                "text-xs font-bold block",
                stats.overdueCount > 0 ? "text-red-700" : "text-gray-500"
              )}
            >
              เกินเกณฑ์ (&gt; 8 นาที)
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={cn(
                  "text-2xl font-black",
                  stats.overdueCount > 0 ? "text-red-600" : "text-gray-400"
                )}
              >
                {stats.overdueCount}
              </span>
              <span
                className={cn(
                  "text-xs",
                  stats.overdueCount > 0 ? "text-red-500 font-semibold" : "text-gray-400"
                )}
              >
                {stats.overdueCount > 0 ? "เร่งด่วน!" : "รายการ"}
              </span>
            </div>
          </div>

          {/* การ์ด 4: เวลาเฉลี่ย */}
          <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
            <span className="text-xs text-gray-500 font-medium block">
              เวลาเฉลี่ยสถานีนี้
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-gray-800">4.2</span>
              <span className="text-xs text-gray-400">นาที / บิล</span>
            </div>
          </div>
        </div>

        {/* ═══ แบนเนอร์แจ้งเตือนเมื่อมีออเดอร์ใหม่ ═══ */}
        {newOrderAlert && (
          <div className="mt-3 bg-[#7F1D1D] text-white p-3.5 rounded-2xl shadow-lg flex items-center justify-between gap-3 animate-bounce">
            <div className="flex items-center gap-3">
              <Bell className="text-yellow-300 animate-spin" size={20} />
              <div>
                <p className="text-xs font-black text-yellow-300">
                  {newOrderAlert.message}
                </p>
                <p className="text-[11px] text-red-200">
                  กรุณาตรวจสอบถาดเนื้อและของสดเร่งด่วน
                </p>
              </div>
            </div>
            <button
              onClick={() => setNewOrderAlert(null)}
              className="bg-white text-[#7F1D1D] px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-50 transition-colors"
            >
              รับทราบ / ดับเสียง
            </button>
          </div>
        )}
      </section>

      {/* ═══ 4. พื้นที่แสดงเนื้อหาหลัก (Main Content) ═══ */}
      <main className="max-w-7xl w-full mx-auto p-4 flex-1">
        {/* สถานะกำลังโหลด */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#7F1D1D] rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-gray-600">
              กำลังโหลดข้อมูลออเดอร์จากฐานข้อมูล...
            </p>
          </div>
        )}

        {/* กรณีมี Error */}
        {!isLoading && errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center max-w-md mx-auto my-12">
            <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-red-700 mb-4">{errorMessage}</p>
            <button
              onClick={() => loadOrders(true)}
              className="px-5 py-2.5 bg-[#7F1D1D] text-white rounded-xl text-xs font-bold hover:bg-red-800 transition-colors shadow-md"
            >
              ลองเชื่อมต่อใหม่
            </button>
          </div>
        )}

        {/* กรณีไม่มีออเดอร์ค้างเลย */}
        {!isLoading && !errorMessage && orders.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-3xl p-16 text-center max-w-lg mx-auto my-12 bg-white">
            <span className="text-5xl block mb-3">🍲</span>
            <h3 className="text-base font-bold text-gray-800">
              ไม่มีออเดอร์ที่รอทำในขณะนี้
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              เมื่อมีลูกค้าสั่งอาหารผ่าน QR โต๊ะ ระบบจะแสดงรายการที่นี่แบบเรียลไทม์
            </p>
          </div>
        )}

        {/* ═══ โครงสร้าง 2 คอลัมน์: การ์ดออเดอร์ + พาเนล Recall ═══ */}
        {!isLoading && !errorMessage && orders.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
            {/* คอลัมน์ซ้าย (3 ส่วน): รายการออเดอร์ */}
            <div className="lg:col-span-3">
              {viewMode === "ticket" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {orders.map((order) => (
                    <OrderTicketCard
                      key={order.order_id}
                      order={order}
                      nowTimestamp={nowTimestamp}
                      onStatusChange={() => loadOrders(false)}
                    />
                  ))}
                </div>
              ) : (
                <ConsolidatedPrepList orders={orders} />
              )}
            </div>

            {/* คอลัมน์ขวา (1 ส่วน): พาเนล Recall ออเดอร์ที่เพิ่งเสิร์ฟ */}
            <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    ออเดอร์ที่เพิ่งเสิร์ฟล่าสุด (Recall)
                  </span>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  {recentlyServed.length} รายการ
                </span>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                หากกดเสิร์ฟผิดพลาด สามารถกดปุ่ม &quot;เรียกคืน&quot; เพื่อนำออเดอร์กลับเข้าหน้าจอได้ทันที
              </p>

              {/* รายการ Recall */}
              <div className="space-y-2.5">
                {recentlyServed.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    ยังไม่มีรายการที่เสิร์ฟในรอบนี้
                  </p>
                ) : (
                  recentlyServed.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl border border-gray-100 bg-gray-50/60 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded">
                            เสิร์ฟแล้ว
                          </span>
                          <span className="text-xs font-bold text-gray-800 truncate">
                            โต๊ะ {item.table_number}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 font-medium truncate mt-0.5">
                          {item.menu_name} x{item.quantity}
                        </p>
                      </div>

                      <button
                        onClick={() => handleRecall(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-[11px] font-bold hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors flex-shrink-0 shadow-2xs"
                        title="เรียกคืนรายการนี้กลับเข้าจอ"
                      >
                        <RotateCcw size={11} />
                        <span>เรียกคืน</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* ประสิทธิภาพการออกอาหารวันนี้ */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500 font-medium flex items-center gap-1">
                    <TrendingUp size={12} className="text-emerald-500" />
                    ประสิทธิภาพวันนี้
                  </span>
                  <span className="font-bold text-emerald-600">96.4%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full"
                    style={{ width: "96.4%" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                  <span>เสิร์ฟสำเร็จ 142 บิล</span>
                  <span className="text-red-400">เกินเวลา 4 บิล</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
