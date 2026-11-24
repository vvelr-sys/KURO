/**
 * ฟังก์ชันคำนวณสต็อกรายวัน (ไม่มี side effect ใช้ได้ทั้ง Server และ Client)
 *
 * หลักการ "ยอดเริ่มต้นของวัน":
 *   - ถ้ามีผลนับรอบเปิดร้านที่ Manager อนุมัติแล้ว → เริ่มจากยอดที่นับได้จริง (startSource = 'counted')
 *     แล้วนับเฉพาะความเคลื่อนไหวหลังเวลานับ (ไม่รวมรายการปรับยอดของรอบเปิดร้านเอง)
 *   - ถ้ายังไม่มี → เริ่มจากยอดในระบบตอน 00:00 เวลาไทย (startSource = 'system')
 *     = ยอดปัจจุบัน − ผลรวมความเคลื่อนไหวทั้งวัน
 */

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

/**
 * วันที่วันนี้ตามเวลาไทย และเวลาเที่ยงคืนของวันนั้น
 * @param {Date} [now]
 * @returns {{ dateText: string, dayStartIso: string }} เช่น { dateText: '2026-11-24', dayStartIso: '2026-11-24T00:00:00+07:00' }
 */
export function getBangkokToday(now = new Date()) {
  // en-CA ให้รูปแบบ YYYY-MM-DD
  const dateText = new Intl.DateTimeFormat('en-CA', { timeZone: BANGKOK_TIME_ZONE }).format(now);
  return { dateText, dayStartIso: `${dateText}T00:00:00+07:00` };
}

/**
 * รวมตัวเลขแบบปัดทศนิยม 3 ตำแหน่ง (หน่วยสต็อกเก็บเป็น NUMERIC(12,3))
 * @param {number} value
 */
function roundStock(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * สถานะสต็อกเพื่อการสั่งซื้อ
 * @param {number} remaining
 * @param {number} reorderPoint
 * @returns {'out'|'reorder'|'ok'}
 */
export function getStockStatus(remaining, reorderPoint) {
  if (remaining <= 0) return 'out';
  if (remaining <= reorderPoint) return 'reorder';
  return 'ok';
}

const STATUS_SORT_ORDER = { out: 0, reorder: 1, ok: 2 };

/**
 * คำนวณสรุปสต็อกวันนี้ของวัตถุดิบ 1 รายการ
 *
 * @param {object} params
 * @param {{ id: string, name: string, unit: string, current_stock: number|string, minimum_threshold: number|string }} params.ingredient
 * @param {Array<{ movement_type: string, quantity: number|string, created_at: string, stock_count_id: string|null }>} params.movements - ความเคลื่อนไหววันนี้ของวัตถุดิบนี้ เรียงเวลาเก่า → ใหม่
 * @param {{ id: string, created_at: string, counted_stock: number } | null} params.openingCount - ผลนับรอบเปิดร้านที่อนุมัติแล้ว (ถ้ามี)
 * @param {{ id: string, created_at: string, counted_stock: number } | null} params.closingCount - ผลนับรอบปิดร้านที่อนุมัติแล้ว (ถ้ามี)
 * @param {string} params.dayStartIso
 * @param {boolean} [params.includePoints] - ใส่จุดกราฟด้วยหรือไม่ (ใส่เฉพาะวัตถุดิบที่กำลังดูกราฟ)
 */
export function buildIngredientDaySummary({
  ingredient,
  movements,
  openingCount,
  closingCount,
  dayStartIso,
  includePoints = false,
}) {
  const currentStock = Number(ingredient.current_stock);
  const reorderPoint = Number(ingredient.minimum_threshold);

  let startValue;
  let startTime;
  let startSource;
  let relevantMovements;

  if (openingCount) {
    // เริ่มจากยอดนับจริงตอนเปิดร้าน
    startValue = Number(openingCount.counted_stock);
    startTime = openingCount.created_at;
    startSource = 'counted';
    const countTimeMs = new Date(openingCount.created_at).getTime();
    relevantMovements = movements.filter(
      (movement) =>
        new Date(movement.created_at).getTime() > countTimeMs &&
        movement.stock_count_id !== openingCount.id
    );
  } else {
    // เริ่มจากยอดในระบบตอนเที่ยงคืน
    const totalChangeToday = movements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    startValue = roundStock(currentStock - totalChangeToday);
    startTime = dayStartIso;
    startSource = 'system';
    relevantMovements = movements;
  }

  // แยกยอดตามประเภท (แสดงเป็นค่าบวกในตาราง)
  let usedTotal = 0;     // ครัวใช้สุทธิ (หักคืนจากการยกเลิกแล้ว)
  let wasteTotal = 0;
  let restockTotal = 0;
  let adjustTotal = 0;   // ปรับยอดตรวจนับ (บวกหรือลบ)

  let runningValue = startValue;
  const points = includePoints
    ? [{ time: startTime, value: startValue, type: 'start' }]
    : null;

  for (const movement of relevantMovements) {
    const quantity = Number(movement.quantity);

    if (movement.movement_type === 'actual_consumption' || movement.movement_type === 'cancel_return') {
      usedTotal -= quantity;
    } else if (movement.movement_type === 'kitchen_waste') {
      wasteTotal -= quantity;
    } else if (movement.movement_type === 'manual_restock') {
      restockTotal += quantity;
    } else if (movement.movement_type === 'stock_count_adjustment') {
      adjustTotal += quantity;
    }

    runningValue = roundStock(runningValue + quantity);
    if (points) {
      points.push({ time: movement.created_at, value: runningValue, type: movement.movement_type });
    }
  }

  return {
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    reorderPoint,
    startValue,
    startTime,
    startSource,
    usedTotal: roundStock(usedTotal),
    wasteTotal: roundStock(wasteTotal),
    restockTotal: roundStock(restockTotal),
    adjustTotal: roundStock(adjustTotal),
    remaining: currentStock,
    status: getStockStatus(currentStock, reorderPoint),
    closingCount: closingCount
      ? { time: closingCount.created_at, value: Number(closingCount.counted_stock) }
      : null,
    points,
  };
}

/**
 * เรียงรายการ: หมด → ต้องสั่งซื้อ → พอ แล้วเรียงตามชื่อ
 * @param {Array<{ status: string, name: string }>} rows
 */
export function sortStockRows(rows) {
  return [...rows].sort((a, b) => {
    const byStatus = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name, 'th');
  });
}

/**
 * แสดงตัวเลขสต็อกแบบไทย เช่น 2,400 หรือ 12.5
 * @param {number} value
 */
export function formatStockNumber(value) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 }).format(value || 0);
}

/**
 * แสดงเวลาแบบ 24 ชั่วโมงตามเวลาไทย เช่น 14:05
 * @param {string|number|Date} time
 */
export function formatBangkokTime(time) {
  return new Date(time).toLocaleTimeString('th-TH', {
    timeZone: BANGKOK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
