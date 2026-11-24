'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

const CHART_HEIGHT = 260;
const MARGIN = { top: 16, right: 12, bottom: 36, left: 64 };
const BAR_COLOR = '#6f0c20';   // = สี primary ของระบบ
const GRID_COLOR = '#e4e2e1';  // = สี line
const TEXT_MUTED = '#574142';  // = สี ink-muted

/** ขั้นตัวเลขแกน Y ที่อ่านง่าย (1, 2, 5 × 10ⁿ) */
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

/** ย่อตัวเลขเงินบนแกน เช่น 12,500 → 12.5K */
function formatAxisMoney(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}

/** ป้ายแกน X: วัน "25/11" หรือเดือน "11/2026" */
function formatPeriodLabel(period) {
  if (period.length === 7) return `${period.slice(5, 7)}/${period.slice(0, 4)}`;
  return `${period.slice(8, 10)}/${period.slice(5, 7)}`;
}

/**
 * กราฟแท่งยอดขายรายวัน/รายเดือน (SVG ไม่ใช้ไลบรารี) — แตะ/ชี้แท่งเพื่อดูตัวเลข
 * @param {{ periods: Array<{ period: string, sales: number, bills: number, guests: number }> }} props
 */
function SalesBarChart({ periods }) {
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (chartWidth === 0 || periods.length === 0) return null;
    const plotWidth = Math.max(chartWidth - MARGIN.left - MARGIN.right, 100);
    const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    const { niceMax, ticks } = getNiceTicks(Math.max(...periods.map((row) => row.sales)) * 1.05);
    const slotWidth = plotWidth / periods.length;
    const barWidth = Math.max(Math.min(slotWidth * 0.7, 48), 2);
    // แสดงป้ายแกน X ไม่ให้ทับกัน (อย่างน้อย 44px ต่อป้าย)
    const labelEvery = Math.max(Math.ceil(44 / slotWidth), 1);
    return {
      plotHeight,
      ticks,
      slotWidth,
      barWidth,
      labelEvery,
      yOf: (value) => MARGIN.top + plotHeight - (value / niceMax) * plotHeight,
    };
  }, [chartWidth, periods]);

  const activeRow = activeIndex !== null ? periods[activeIndex] : null;

  return (
    <div ref={containerRef} className="relative" role="img" aria-label="กราฟแท่งยอดขาย (ตัวเลขทั้งหมดอยู่ในตารางและไฟล์ CSV)">
      {layout && (
        <svg width={chartWidth} height={CHART_HEIGHT} className="block select-none">
          {layout.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={chartWidth - MARGIN.right} y1={layout.yOf(tick)} y2={layout.yOf(tick)} stroke={GRID_COLOR} />
              <text x={MARGIN.left - 8} y={layout.yOf(tick)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill={TEXT_MUTED}>
                {formatAxisMoney(tick)}
              </text>
            </g>
          ))}

          {periods.map((row, index) => {
            const centerX = MARGIN.left + layout.slotWidth * (index + 0.5);
            const barTop = layout.yOf(row.sales);
            const isActive = index === activeIndex;
            return (
              <g
                key={row.period}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerDown={() => setActiveIndex(index)}
                onPointerLeave={() => setActiveIndex(null)}
              >
                {/* พื้นที่รับเมาส์/นิ้วเต็มช่อง (แท่งเตี้ยก็แตะได้) */}
                <rect x={centerX - layout.slotWidth / 2} y={MARGIN.top} width={layout.slotWidth} height={layout.plotHeight} fill="transparent" />
                <rect
                  x={centerX - layout.barWidth / 2}
                  y={barTop}
                  width={layout.barWidth}
                  height={Math.max(MARGIN.top + layout.plotHeight - barTop, row.sales > 0 ? 1 : 0)}
                  rx={Math.min(4, layout.barWidth / 2)}
                  fill={BAR_COLOR}
                  fillOpacity={activeIndex === null || isActive ? 1 : 0.45}
                />
                {index % layout.labelEvery === 0 && (
                  <text x={centerX} y={CHART_HEIGHT - 12} textAnchor="middle" fontSize={12} fill={TEXT_MUTED}>
                    {formatPeriodLabel(row.period)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {layout && activeRow && (
        <div
          className="pointer-events-none absolute rounded-xl bg-white px-3 py-2 text-sm shadow-md ring-1 ring-line"
          style={{
            left: Math.min(MARGIN.left + layout.slotWidth * (activeIndex + 0.5) + 10, chartWidth - 180),
            top: MARGIN.top,
            width: 170,
          }}
        >
          <p className="font-bold tabular-nums">{formatCurrency(activeRow.sales)}</p>
          <p className="text-ink-muted">{formatPeriodLabel(activeRow.period)}</p>
          <p className="text-ink-muted">
            {activeRow.bills} บิล · {activeRow.guests} คน
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(SalesBarChart);
