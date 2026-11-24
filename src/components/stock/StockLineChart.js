'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STOCK_MOVEMENT_LABELS } from '@/lib/constants';
import { formatBangkokTime, formatStockNumber } from '@/lib/stock';

// ─── สีกราฟ (ผ่านตัวตรวจสี dataviz: ความสว่าง, ความอิ่มสี, ความต่างกับพื้นหลัง ≥ 3:1) ───
const CHART_COLORS = {
  surface: '#fcfcfb',     // พื้นกราฟ
  series: '#2a78d6',      // เส้นยอดคงเหลือ
  grid: '#e1e0d9',        // เส้นตาราง (บางมาก)
  axis: '#c3c2b7',        // เส้นฐาน
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  reorderLine: '#d03b3b', // เส้นจุดสั่งซื้อ (สีสถานะ critical — มีป้ายข้อความกำกับเสมอ)
};

/**
 * เหตุการณ์สำคัญที่ต้องเห็นบนเส้น (ครัวใช้ปกติ/คืนจากยกเลิก ไม่ใส่สัญลักษณ์ — ถี่เกินไป อ่านยาก)
 * แยกด้วย "รูปทรง + สี + ป้ายข้อความ" ไม่พึ่งสีอย่างเดียว
 */
const EVENT_MARKERS = {
  manual_restock: { shape: 'triangle-up', color: '#1a7f45', label: 'รับเข้า' },
  kitchen_waste: { shape: 'triangle-down', color: '#b45309', label: 'ของเสีย' },
  stock_count_adjustment: { shape: 'diamond', color: '#6d4bc2', label: 'ปรับยอด' },
};

// ถ้าเหตุการณ์มากกว่านี้ แสดงแค่สัญลักษณ์ ไม่แสดงป้ายตัวเลข (กันป้ายทับกัน — ดูค่าได้จากการชี้/ตาราง)
const MAX_EVENT_LABELS = 6;

/**
 * รูปสัญลักษณ์เหตุการณ์ (วาดรอบจุด cx, cy)
 * @param {{ shape: string, color: string, cx: number, cy: number, size?: number }} props
 */
function EventMarker({ shape, color, cx, cy, size = 7 }) {
  const common = { fill: color, stroke: CHART_COLORS.surface, strokeWidth: 1.5 };
  if (shape === 'triangle-up') {
    return <polygon points={`${cx},${cy - size} ${cx + size},${cy + size * 0.8} ${cx - size},${cy + size * 0.8}`} {...common} />;
  }
  if (shape === 'triangle-down') {
    return <polygon points={`${cx},${cy + size} ${cx + size},${cy - size * 0.8} ${cx - size},${cy - size * 0.8}`} {...common} />;
  }
  return <polygon points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`} {...common} />;
}

/**
 * สร้างเส้นโค้งแบบคลื่นผ่านทุกจุด (Monotone Cubic — วิธี Fritsch–Carlson)
 * โค้งนุ่มแต่ "ไม่พุ่งเกินจุดจริง" จึงไม่วาดยอดติดลบหรือสูงกว่าที่มีจริง
 * @param {{ x: number, y: number }[]} points - เรียงตาม x
 * @returns {string} คำสั่ง path ของ SVG
 */
function buildSmoothPath(points) {
  // จุดที่ x ซ้ำกัน (หลายรายการในเวลาเดียวกัน) ใช้ค่าล่าสุด
  const uniquePoints = [];
  for (const point of points) {
    const last = uniquePoints[uniquePoints.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.01) uniquePoints[uniquePoints.length - 1] = point;
    else uniquePoints.push(point);
  }

  const count = uniquePoints.length;
  if (count === 0) return '';
  if (count === 1) return `M${uniquePoints[0].x},${uniquePoints[0].y}`;

  // ความชันระหว่างจุด
  const gaps = [];
  const slopes = [];
  for (let index = 0; index < count - 1; index += 1) {
    const gap = uniquePoints[index + 1].x - uniquePoints[index].x;
    gaps.push(gap);
    slopes.push((uniquePoints[index + 1].y - uniquePoints[index].y) / gap);
  }

  // ความชันที่แต่ละจุด: ถ้าขึ้น-ลงสลับกันให้แบน (กันเส้นพุ่งเกิน)
  const tangents = [slopes[0]];
  for (let index = 1; index < count - 1; index += 1) {
    if (slopes[index - 1] * slopes[index] <= 0) {
      tangents.push(0);
    } else {
      const weightA = 2 * gaps[index] + gaps[index - 1];
      const weightB = gaps[index] + 2 * gaps[index - 1];
      tangents.push((weightA + weightB) / (weightA / slopes[index - 1] + weightB / slopes[index]));
    }
  }
  tangents.push(slopes[count - 2]);

  let path = `M${uniquePoints[0].x},${uniquePoints[0].y}`;
  for (let index = 0; index < count - 1; index += 1) {
    const from = uniquePoints[index];
    const to = uniquePoints[index + 1];
    const third = gaps[index] / 3;
    path += `C${from.x + third},${from.y + tangents[index] * third} ${to.x - third},${to.y - tangents[index + 1] * third} ${to.x},${to.y}`;
  }
  return path;
}

/**
 * แสดงตัวเลขการเปลี่ยนแปลงพร้อมเครื่องหมาย เช่น +200, −80
 * @param {number} change
 */
function formatChange(change) {
  if (change === 0) return '0';
  return `${change > 0 ? '+' : '−'}${formatStockNumber(Math.abs(change))}`;
}

const CHART_HEIGHT = 280;
const MARGIN = { top: 28, right: 104, bottom: 32, left: 56 };
const HOUR_MS = 60 * 60 * 1000;

/**
 * หาขั้นตัวเลขแกน Y ที่อ่านง่าย (1, 2, 5 × 10ⁿ)
 * @param {number} maxValue
 * @param {number} tickCount
 */
function getNiceTicks(maxValue, tickCount = 4) {
  const safeMax = maxValue > 0 ? maxValue : 1;
  const roughStep = safeMax / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= roughStep);
  const niceMax = Math.ceil(safeMax / step) * step;
  const ticks = [];
  for (let value = 0; value <= niceMax + step / 2; value += step) ticks.push(value);
  return { niceMax, ticks };
}

/**
 * หาจุดที่ใกล้ตำแหน่งเวลา x ที่สุด (ค้นหาแบบแบ่งครึ่ง — จุดเรียงตามเวลาอยู่แล้ว)
 * @param {number[]} times
 * @param {number} targetTime
 */
function findNearestIndex(times, targetTime) {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (times[middle] < targetTime) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(times[low - 1] - targetTime) <= Math.abs(times[low] - targetTime)) {
    return low - 1;
  }
  return low;
}

/**
 * ป้ายประเภทของจุดบนกราฟ
 * @param {string} type
 * @param {'counted'|'system'} startSource
 */
function getPointLabel(type, startSource) {
  if (type === 'start') return startSource === 'counted' ? 'เริ่มต้น (นับจริงตอนเปิดร้าน)' : 'เริ่มต้น (ยอดระบบ 00:00)';
  if (type === 'now') return 'ตอนนี้';
  return STOCK_MOVEMENT_LABELS[type] ?? type;
}

/**
 * กราฟเส้นยอดคงเหลือของวัตถุดิบ 1 รายการ วันนี้ (เส้นโค้งแบบคลื่น + พื้นไล่สี)
 * แกน X = เวลา (เวลาไทย), แกน Y = ยอดคงเหลือ
 *
 * @param {object} props
 * @param {object} props.row - ผลจาก buildIngredientDaySummary (ต้องมี points)
 * @param {number} props.nowMs - เวลาปัจจุบัน จากตัวจับเวลากลางของหน้า
 */
const StockLineChart = React.memo(function StockLineChart({ row, nowMs }) {
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);
  const [showTable, setShowTable] = useState(false);

  // วัดความกว้างจริงของกล่อง เพื่อวาดตัวอักษรขนาดคงที่ ไม่ย่อตามจอ
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // จุดทั้งหมด + จุด "ตอนนี้" ต่อท้าย
  const chartPoints = useMemo(() => {
    const basePoints = (row.points || []).map((point) => ({
      ...point,
      timeMs: new Date(point.time).getTime(),
    }));
    if (basePoints.length === 0) return [];
    const lastPoint = basePoints[basePoints.length - 1];
    const endTimeMs = Math.max(nowMs, lastPoint.timeMs);
    return [...basePoints, { time: new Date(endTimeMs).toISOString(), timeMs: endTimeMs, value: lastPoint.value, type: 'now' }];
  }, [row.points, nowMs]);

  const scales = useMemo(() => {
    if (chartPoints.length === 0 || chartWidth === 0) return null;

    const plotWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 100);
    const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

    const startMs = chartPoints[0].timeMs;
    const endMs = Math.max(chartPoints[chartPoints.length - 1].timeMs, startMs + HOUR_MS);

    const highestValue = Math.max(...chartPoints.map((point) => point.value), row.reorderPoint);
    const { niceMax, ticks: yTicks } = getNiceTicks(highestValue * 1.05);

    const xOf = (timeMs) => MARGIN.left + ((timeMs - startMs) / (endMs - startMs)) * plotWidth;
    const yOf = (value) => MARGIN.top + plotHeight - (value / niceMax) * plotHeight;

    // ป้ายเวลาแกน X ทุก 1/2/3/4 ชั่วโมง แล้วแต่ความกว้าง (เวลาไทยไม่มี DST ปัดเป็นชั่วโมงตรงได้เลย)
    const totalHours = (endMs - startMs) / HOUR_MS;
    const maxLabels = Math.max(Math.floor(plotWidth / 64), 2);
    const hourStep = [1, 2, 3, 4, 6].find((step) => totalHours / step <= maxLabels) ?? 6;
    const xTicks = [];
    for (let tick = Math.ceil(startMs / HOUR_MS) * HOUR_MS; tick <= endMs; tick += HOUR_MS) {
      const bangkokHour = new Date(tick + 7 * HOUR_MS).getUTCHours();
      if (bangkokHour % hourStep === 0) xTicks.push(tick);
    }

    return { plotWidth, plotHeight, xOf, yOf, yTicks, xTicks };
  }, [chartPoints, chartWidth, row.reorderPoint]);

  const pointTimes = useMemo(() => chartPoints.map((point) => point.timeMs), [chartPoints]);

  // เหตุการณ์สำคัญ (รับเข้า / ของเสีย / ปรับยอด) พร้อมจำนวนที่เปลี่ยน
  const eventPoints = useMemo(
    () =>
      chartPoints
        .map((point, index) => ({
          ...point,
          change: index === 0 ? 0 : point.value - chartPoints[index - 1].value,
          marker: EVENT_MARKERS[point.type],
        }))
        .filter((point) => point.marker),
    [chartPoints]
  );
  const showEventLabels = eventPoints.length <= MAX_EVENT_LABELS;

  // เส้นโค้งแบบคลื่นผ่านทุกจุด (ไม่พุ่งเกินค่าจริง)
  const linePath = useMemo(() => {
    if (!scales) return '';
    const { xOf, yOf } = scales;
    return buildSmoothPath(chartPoints.map((point) => ({ x: xOf(point.timeMs), y: yOf(point.value) })));
  }, [chartPoints, scales]);

  const handlePointerMove = useCallback(
    (event) => {
      if (!scales) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - bounds.left;
      const startMs = pointTimes[0];
      const endMs = Math.max(pointTimes[pointTimes.length - 1], startMs + HOUR_MS);
      const ratio = Math.min(Math.max((pointerX - MARGIN.left) / scales.plotWidth, 0), 1);
      setActiveIndex(findNearestIndex(pointTimes, startMs + ratio * (endMs - startMs)));
    },
    [scales, pointTimes]
  );

  // ใช้ปุ่มลูกศรเลื่อนดูทีละจุดได้ (ผู้ใช้คีย์บอร์ด)
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        setActiveIndex((current) => {
          const start = current ?? (direction > 0 ? -1 : pointTimes.length);
          return Math.min(Math.max(start + direction, 0), pointTimes.length - 1);
        });
      } else if (event.key === 'Escape') {
        setActiveIndex(null);
      }
    },
    [pointTimes.length]
  );

  if (chartPoints.length === 0) {
    return <p className="p-6 text-center text-ink-muted">ยังไม่มีข้อมูลกราฟของวัตถุดิบนี้</p>;
  }

  const startPoint = chartPoints[0];
  const endPoint = chartPoints[chartPoints.length - 1];
  const activePoint = activeIndex !== null ? chartPoints[activeIndex] : null;
  const isCountedStart = row.startSource === 'counted';
  const closingTimeMs = row.closingCount ? new Date(row.closingCount.time).getTime() : null;

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#2a78d6]/50"
        style={{ background: CHART_COLORS.surface }}
        tabIndex={0}
        role="img"
        aria-label={`กราฟยอดคงเหลือ ${row.name} วันนี้ เริ่ม ${formatStockNumber(startPoint.value)} ตอนนี้ ${formatStockNumber(endPoint.value)} ${row.unit} — กดลูกศรซ้าย/ขวาเพื่อดูทีละจุด`}
        onKeyDown={handleKeyDown}
        onBlur={() => setActiveIndex(null)}
      >
        {scales && (
          <svg width={chartWidth} height={CHART_HEIGHT} className="block select-none">
            {/* เส้นตารางแนวนอน + ตัวเลขแกน Y */}
            {scales.yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + scales.plotWidth}
                  y1={scales.yOf(tick)}
                  y2={scales.yOf(tick)}
                  stroke={tick === 0 ? CHART_COLORS.axis : CHART_COLORS.grid}
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={scales.yOf(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={12}
                  fill={CHART_COLORS.textMuted}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {tick >= 10000 ? `${formatStockNumber(tick / 1000)}K` : formatStockNumber(tick)}
                </text>
              </g>
            ))}

            {/* ป้ายเวลาแกน X */}
            {scales.xTicks.map((tick) => (
              <text
                key={`x-${tick}`}
                x={scales.xOf(tick)}
                y={CHART_HEIGHT - 10}
                textAnchor="middle"
                fontSize={12}
                fill={CHART_COLORS.textMuted}
              >
                {formatBangkokTime(tick)}
              </text>
            ))}

            {/* เส้นจุดสั่งซื้อ */}
            {row.reorderPoint > 0 && (
              <g>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + scales.plotWidth}
                  y1={scales.yOf(row.reorderPoint)}
                  y2={scales.yOf(row.reorderPoint)}
                  stroke={CHART_COLORS.reorderLine}
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left + 4}
                  y={scales.yOf(row.reorderPoint) - 6}
                  fontSize={12}
                  fill={CHART_COLORS.textSecondary}
                >
                  จุดสั่งซื้อ {formatStockNumber(row.reorderPoint)} {row.unit}
                </text>
              </g>
            )}

            {/* พื้นไล่สีใต้เส้น (เข้มด้านบน จางลงด้านล่าง) + เส้นคลื่นยอดคงเหลือ */}
            <defs>
              <linearGradient id={`stock-wave-fill-${row.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.series} stopOpacity={0.28} />
                <stop offset="100%" stopColor={CHART_COLORS.series} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <path
              d={`${linePath}V${scales.yOf(0)}H${scales.xOf(startPoint.timeMs)}Z`}
              fill={`url(#stock-wave-fill-${row.id})`}
            />
            <path
              d={linePath}
              fill="none"
              stroke={CHART_COLORS.series}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* สัญลักษณ์เหตุการณ์สำคัญ วางที่ยอดหลังเปลี่ยน + ป้ายจำนวน (ถ้าไม่ถี่เกิน) */}
            {eventPoints.map((point, index) => {
              const cx = scales.xOf(point.timeMs);
              const cy = scales.yOf(point.value);
              return (
                <g key={`event-${point.time}-${index}`} pointerEvents="none">
                  <EventMarker shape={point.marker.shape} color={point.marker.color} cx={cx} cy={cy} />
                  {showEventLabels && (
                    <text
                      x={cx}
                      y={point.marker.shape === 'triangle-down' ? cy + 20 : cy - 12}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={point.marker.color}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {point.marker.label} {formatChange(point.change)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* จุดนับปิดร้าน (ถ้าอนุมัติแล้ว) */}
            {closingTimeMs !== null && (
              <circle
                cx={scales.xOf(Math.min(closingTimeMs, endPoint.timeMs))}
                cy={scales.yOf(row.closingCount.value)}
                r={5}
                fill={CHART_COLORS.series}
                stroke={CHART_COLORS.surface}
                strokeWidth={2}
              />
            )}

            {/* จุดเริ่มต้น: ทึบ = นับจริง, กลวง = ยอดระบบ */}
            <circle
              cx={scales.xOf(startPoint.timeMs)}
              cy={scales.yOf(startPoint.value)}
              r={5}
              fill={isCountedStart ? CHART_COLORS.series : CHART_COLORS.surface}
              stroke={isCountedStart ? CHART_COLORS.surface : CHART_COLORS.series}
              strokeWidth={2}
            />
            <text
              x={scales.xOf(startPoint.timeMs) + 8}
              y={scales.yOf(startPoint.value) - 10}
              fontSize={12}
              fill={CHART_COLORS.textSecondary}
            >
              เริ่ม {formatStockNumber(startPoint.value)} ({isCountedStart ? 'นับจริง' : 'ยอดระบบ'})
            </text>

            {/* จุดปัจจุบัน + ป้ายค่าที่ปลายเส้น */}
            <circle
              cx={scales.xOf(endPoint.timeMs)}
              cy={scales.yOf(endPoint.value)}
              r={5}
              fill={CHART_COLORS.series}
              stroke={CHART_COLORS.surface}
              strokeWidth={2}
            />
            <text
              x={scales.xOf(endPoint.timeMs) + 10}
              y={scales.yOf(endPoint.value)}
              dominantBaseline="middle"
              fontSize={12}
              fontWeight={600}
              fill={CHART_COLORS.textPrimary}
            >
              ตอนนี้ {formatStockNumber(endPoint.value)}
            </text>

            {/* เส้นชี้ตำแหน่งเมื่อชี้เมาส์/แตะ */}
            {activePoint && (
              <g pointerEvents="none">
                <line
                  x1={scales.xOf(activePoint.timeMs)}
                  x2={scales.xOf(activePoint.timeMs)}
                  y1={MARGIN.top}
                  y2={MARGIN.top + scales.plotHeight}
                  stroke={CHART_COLORS.textMuted}
                  strokeWidth={1}
                />
                <circle
                  cx={scales.xOf(activePoint.timeMs)}
                  cy={scales.yOf(activePoint.value)}
                  r={5}
                  fill={CHART_COLORS.series}
                  stroke={CHART_COLORS.surface}
                  strokeWidth={2}
                />
              </g>
            )}

            {/* พื้นที่รับเมาส์/นิ้ว (ใหญ่กว่าเส้น อ่านค่าได้ทุกตำแหน่ง) */}
            <rect
              x={0}
              y={0}
              width={chartWidth}
              height={CHART_HEIGHT}
              fill="transparent"
              onPointerMove={handlePointerMove}
              onPointerDown={handlePointerMove}
              onPointerLeave={() => setActiveIndex(null)}
            />
          </svg>
        )}

        {/* กล่องแสดงค่า: ค่าเด่น ป้ายรอง */}
        {scales && activePoint && (
          <div
            className="absolute pointer-events-none bg-white border border-black/10 rounded-lg shadow-md px-3 py-2 text-sm"
            style={{
              left: Math.min(scales.xOf(activePoint.timeMs) + 12, chartWidth - 190),
              top: MARGIN.top,
              width: 178,
            }}
          >
            <p className="font-bold tabular-nums" style={{ color: CHART_COLORS.textPrimary }}>
              {formatStockNumber(activePoint.value)} {row.unit}
            </p>
            <p className="flex items-center gap-2" style={{ color: CHART_COLORS.textSecondary }}>
              <span
                className="inline-block w-3 h-0.5 rounded"
                style={{ background: EVENT_MARKERS[activePoint.type]?.color ?? CHART_COLORS.series }}
              />
              {getPointLabel(activePoint.type, row.startSource)}
              {activeIndex > 0 && activePoint.type !== 'now' && (
                <span className="ml-auto font-semibold tabular-nums">
                  {formatChange(activePoint.value - chartPoints[activeIndex - 1].value)}
                </span>
              )}
            </p>
            <p style={{ color: CHART_COLORS.textMuted }}>เวลา {formatBangkokTime(activePoint.time)}</p>
          </div>
        )}
      </div>

      {/* คำอธิบายสัญลักษณ์ + ปุ่มดูเป็นตาราง */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill={CHART_COLORS.series} /></svg>
          นับจริง (อนุมัติแล้ว)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill={CHART_COLORS.surface} stroke={CHART_COLORS.series} strokeWidth="2" /></svg>
          ยอดระบบ (ยังไม่ได้นับ/ยังไม่อนุมัติ)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-px" style={{ background: CHART_COLORS.reorderLine }} />
          จุดสั่งซื้อ
        </span>
        {Object.entries(EVENT_MARKERS).map(([type, marker]) => (
          <span key={type} className="flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden="true">
              <EventMarker shape={marker.shape} color={marker.color} cx={7} cy={7} size={5} />
            </svg>
            {marker.label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="ml-auto font-semibold text-primary hover:underline"
          aria-expanded={showTable}
        >
          {showTable ? 'ซ่อนตาราง' : 'ดูเป็นตาราง'}
        </button>
      </div>

      {showTable && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface sticky top-0">
              <tr className="text-left text-ink-muted">
                <th className="px-3 py-2 font-semibold">เวลา</th>
                <th className="px-3 py-2 font-semibold">รายการ</th>
                <th className="px-3 py-2 font-semibold text-right">เปลี่ยน</th>
                <th className="px-3 py-2 font-semibold text-right">คงเหลือ ({row.unit})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {chartPoints.map((point, index) => {
                const change = index === 0 ? null : point.value - chartPoints[index - 1].value;
                return (
                  <tr key={`${point.time}-${index}`}>
                    <td className="px-3 py-1.5 text-ink-muted">{formatBangkokTime(point.time)}</td>
                    <td className="px-3 py-1.5 text-ink">{getPointLabel(point.type, row.startSource)}</td>
                    <td className="px-3 py-1.5 text-right text-ink-muted">
                      {change === null || change === 0 ? '—' : `${change > 0 ? '+' : ''}${formatStockNumber(change)}`}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-ink">{formatStockNumber(point.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

export default StockLineChart;
