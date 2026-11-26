"use client";

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import {
  AlarmClock,
  BellRing,
  CircleHelp,
  Flame,
  Inbox,
  Layers,
  List,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AlertMessage, Button } from "@/components/ui";
import StationFilter from "./StationFilter";
import OrderTicketCard from "./OrderTicketCard";
import ConsolidatedPrepList from "./ConsolidatedPrepList";
import KitchenGuideModal from "./KitchenGuideModal";
import { useKitchenRealtime } from "@/hooks/useKitchenRealtime";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { useStoredToggle } from "@/hooks/useStoredToggle";
import { getKitchenOrders } from "@/app/(kitchen)/kds/actions";
import { cn } from "@/lib/utils";

/** ใช้รู้ว่ากำลังแสดงผลในเบราว์เซอร์แล้ว (ฝั่ง Server ไม่รู้ว่าเครื่องนี้เคยดูวิธีใช้หรือยัง) */
const subscribeNothing = () => () => {};

/** รอนานเกินกี่นาทีถือว่าเกินเกณฑ์ (ขอบการ์ดเปลี่ยนสีตาม OrderTicketCard) */
const OVERDUE_MINUTES = 8;

const VIEW_MODES = [
  { key: "ticket", label: "การ์ดตามโต๊ะ", icon: Layers },
  { key: "prep", label: "รวมรายการเตรียม", icon: List },
];

/**
 * หน้าจอ KDS (Kitchen Display System) — แสดงภายในโครงหน้า StaffShell (แถบบน/เมนูซ้าย/นาฬิกามาจาก StaffShell)
 * ตรวจสิทธิ์ที่ page.js แล้ว (requireRole) — Server Action ตรวจซ้ำอีกชั้น
 */
export default function KdsScreen() {
  // สถานีครัวที่เลือก (null = ดูทุกสถานี)
  const [selectedStation, setSelectedStation] = useState(null);

  // โหมดมุมมอง: 'ticket' (การ์ดตามโต๊ะ) หรือ 'prep' (รวมรายการเตรียม)
  const [viewMode, setViewMode] = useState("ticket");

  // ข้อมูลออเดอร์ "ทุกสถานี" (โหลดครั้งเดียว แล้วกรองสถานีบนหน้าจอ
  // → ตัวเลขของทุกสถานีบนแถบเลือกไม่หาย และสลับสถานีได้ทันทีไม่ต้องรอโหลด)
  const [allOrders, setAllOrders] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ระบบเสียงแจ้งเตือน
  const { playAlert, soundEnabled, toggleSound } = useAudioAlert();

  // วิธีใช้จอครัว: เปิดเองครั้งแรกของแท็บเล็ตแต่ละเครื่อง (จำใน localStorage) + เปิดซ้ำได้จากปุ่ม ?
  const [hasSeenGuide, setHasSeenGuide] = useStoredToggle("kuro.kdsGuideSeen", false);
  const [isGuideOpenManually, setIsGuideOpenManually] = useState(false);
  const isBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const isGuideOpen = isGuideOpenManually || (isBrowser && !hasSeenGuide);
  const closeGuide = useCallback(() => {
    setHasSeenGuide(true);
    setIsGuideOpenManually(false);
  }, [setHasSeenGuide]);
  const [newOrderAlert, setNewOrderAlert] = useState(null);

  // เวลาปัจจุบันสำหรับตัวจับเวลารายบิล (Centralized Timer — อัปเดตทุก 1 วินาที ที่เดียวทั้งหน้า)
  const [nowTimestamp, setNowTimestamp] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNowTimestamp(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ฟังก์ชันโหลดข้อมูลออเดอร์
  const loadOrders = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      try {
        const ordersRes = await getKitchenOrders(null);
        setAllOrders(ordersRes.orders || []);
        setErrorMessage(ordersRes.error);
      } catch {
        setErrorMessage("เกิดข้อผิดพลาดในการโหลดข้อมูลออเดอร์");
      } finally {
        setIsLoading(false);
        if (isManual) setIsRefreshing(false);
      }
    },
    []
  );

  // โหลดครั้งแรกตอนเปิดหน้า (เปลี่ยนสถานีไม่ต้องโหลดใหม่)
  useEffect(() => {
    let isCurrent = true;

    getKitchenOrders(null).then((ordersRes) => {
      if (!isCurrent) return;
      setAllOrders(ordersRes.orders || []);
      setErrorMessage(ordersRes.error);
      setIsLoading(false);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  // ดักฟัง Supabase Realtime ทุกสถานี (ให้ตัวเลขของสถานีอื่นอัปเดตด้วย)
  useKitchenRealtime({
    station: null,
    onNewOrder: () => {
      playAlert();
      setNewOrderAlert({
        id: Date.now(),
        message: "มีออเดอร์ใหม่จากโต๊ะลูกค้า",
      });
      loadOrders(false);
    },
    onOrderChange: () => loadOrders(false),
    onMenuChange: () => loadOrders(false),
  });

  // ─── ออเดอร์ที่แสดงตามสถานีที่เลือก ──────────────────────────
  // เก็บเฉพาะรายการของสถานีนั้น และตัดบิลที่ไม่มีรายการค้าง (รอทำ/กำลังทำ) ของสถานีนั้นออก
  const orders = useMemo(() => {
    if (!selectedStation) return allOrders;
    return allOrders
      .map((order) => ({ ...order, items: order.items.filter((item) => item.station === selectedStation) }))
      .filter((order) => order.items.some((item) => item.status === "pending" || item.status === "cooking"));
  }, [allOrders, selectedStation]);

  // ─── จำนวนจานรอทำ/กำลังทำ แยกสถานี (นับจากทุกสถานีเสมอ ไม่ขึ้นกับสถานีที่เลือก) ───
  const stationCounts = useMemo(() => {
    const counts = { fresh: 0, beverage: 0, grill: 0, hot_kitchen: 0 };
    for (const order of allOrders) {
      for (const item of order.items) {
        if ((item.status === "pending" || item.status === "cooking") && counts[item.station] !== undefined) {
          counts[item.station] += item.quantity;
        }
      }
    }
    return counts;
  }, [allOrders]);

  // ─── คำนวณสรุปสถิติด้านบน (Stats Bar) ของสถานีที่เลือก ──────────────────────────
  const stats = useMemo(() => {
    let waitingCount = 0;
    let cookingCount = 0;
    let overdueCount = 0;

    for (const order of orders) {
      for (const item of order.items) {
        if (item.status === "cancelled") continue;

        if (item.status === "pending") {
          waitingCount += item.quantity;
        } else if (item.status === "cooking") {
          cookingCount += item.quantity;
        }

        // เช็คเกินเกณฑ์
        if (item.status === "pending" || item.status === "cooking") {
          const waitSecs = (nowTimestamp - new Date(item.created_at).getTime()) / 1000;
          if (waitSecs > OVERDUE_MINUTES * 60) {
            overdueCount += 1;
          }
        }
      }
    }

    return {
      waitingCount,
      cookingCount,
      overdueCount,
    };
  }, [orders, nowTimestamp]);

  const summaryCards = [
    { label: 'รอทำ', value: stats.waitingCount, icon: Inbox, iconClass: 'bg-danger-soft text-danger' },
    { label: 'กำลังทำ', value: stats.cookingCount, icon: Flame, iconClass: 'bg-primary text-white' },
    {
      label: `รอนานเกิน ${OVERDUE_MINUTES} นาที`,
      value: stats.overdueCount,
      icon: AlarmClock,
      iconClass: 'bg-danger text-white',
      highlight: stats.overdueCount > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KitchenGuideModal isOpen={isGuideOpen} onClose={closeGuide} />

      {/* ═══ หัวเรื่อง + ปุ่มเสียง/รีเฟรช (แบบเดียวกับหน้าเรียกพนักงาน) ═══ */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">จอครัว</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsGuideOpenManually(true)}
            className="flex h-11 items-center gap-2 rounded-full bg-white px-4 font-semibold shadow-sm hover:bg-surface"
          >
            <CircleHelp className="size-5" aria-hidden />
            วิธีใช้
          </button>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            className="flex h-11 items-center gap-2 rounded-full bg-white px-4 font-semibold shadow-sm hover:bg-surface"
          >
            {soundEnabled ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
            เสียงเตือนออเดอร์ใหม่: {soundEnabled ? 'เปิด' : 'ปิด'}
          </button>
          <button
            type="button"
            onClick={() => loadOrders(true)}
            disabled={isLoading || isRefreshing}
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm hover:bg-surface disabled:opacity-40"
            aria-label="โหลดข้อมูลใหม่"
            title="โหลดข้อมูลใหม่"
          >
            <RefreshCw className={cn('size-5', isRefreshing && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </div>

      {/* ═══ แจ้งเตือนออเดอร์ใหม่ ═══ */}
      {newOrderAlert && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-white">
          <BellRing className="size-6 shrink-0" aria-hidden />
          <p className="flex-1 font-bold">{newOrderAlert.message}</p>
          <Button size="sm" variant="secondary" onClick={() => setNewOrderAlert(null)}>
            รับทราบ
          </Button>
        </div>
      )}

      {/* ═══ การ์ดสรุป ═══ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryCards.map(({ label, value, icon: Icon, iconClass, highlight }) => (
          <div key={label} className={cn('flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm', highlight && 'ring-2 ring-danger')}>
            <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm text-ink-muted">{label}</p>
              <p className="text-2xl font-bold">
                {value} <span className="text-sm font-normal text-ink-muted">จาน</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ เลือกสถานี + สลับมุมมอง ═══ */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
        <StationFilter
          selectedStation={selectedStation}
          onSelect={setSelectedStation}
          orderCountByStation={stationCounts}
        />
        <div className="ml-auto flex gap-1 rounded-full bg-surface p-1" role="group" aria-label="เลือกมุมมอง">
          {VIEW_MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewMode(key)}
              aria-pressed={viewMode === key}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
                viewMode === key ? 'bg-primary text-white' : 'text-ink hover:bg-white'
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ เนื้อหาหลัก ═══ */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />
      ) : errorMessage ? (
        <div className="flex flex-col items-start gap-3">
          <AlertMessage className="w-full">{errorMessage}</AlertMessage>
          <Button variant="secondary" icon={RefreshCw} onClick={() => loadOrders(true)}>
            ลองโหลดใหม่
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ตอนนี้ไม่มีออเดอร์ที่ต้องทำ</p>
      ) : viewMode === 'ticket' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
  );
}
