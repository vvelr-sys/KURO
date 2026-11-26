'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { AlertMessage, Button } from '@/components/ui';
import { AUDIT_ACTION_LABELS, ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import AuditChangeTable from './AuditChangeTable';

const INPUT_CLASS = 'h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-primary';

/** วันที่ YYYY-MM-DD ตามเวลาไทย */
function bangkokDateText(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
}

/** วันเวลาไทย เช่น 25/11/2026 14:05 */
function formatDateTime(iso) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// เหตุการณ์ที่ควรเด่น (เกี่ยวกับเงิน / ทำแทนกรณีฉุกเฉิน)
const HIGHLIGHT_ACTIONS = new Set(['EMERGENCY_OVERRIDE', 'APPROVE_DISCOUNT', 'REMOVE_DISCOUNT', 'ADJUST_STOCK_COUNT']);

/**
 * หน้า 4.7 ประวัติการทำงาน (Audit Log) — ใคร ทำอะไร เมื่อไหร่ เหตุผลอะไร
 * Admin เห็นทั้งหมด · Manager เห็นทั้งหมดยกเว้นรายการที่ Admin เป็นผู้ทำ (บังคับใน RLS)
 *
 * @param {object} props
 * @param {string} props.staffRole
 * @param {() => Promise<{ staff: Array, error: string|null }>} props.loadActorsAction
 * @param {(filters: object) => Promise<{ logs: Array, nameById: Record<string, string>, isTruncated: boolean, error: string|null }>} props.loadLogsAction
 */
export default function AuditLogScreen({ staffRole, loadActorsAction, loadLogsAction }) {
  const [actors, setActors] = useState([]);
  const [filters, setFilters] = useState(() => ({
    fromDate: bangkokDateText(new Date(Date.now() - 6 * 86400000)),
    toDate: bangkokDateText(),
    action: '',
    actorId: '',
    keyword: '',
  }));
  const [logs, setLogs] = useState([]);
  const [nameById, setNameById] = useState({});
  const [isTruncated, setIsTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const applyResult = useCallback((result) => {
    setLogs(result.logs);
    setNameById(result.nameById ?? {});
    setIsTruncated(result.isTruncated);
    setPageError(result.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    loadActorsAction().then((result) => {
      if (isCurrent) setActors(result.staff);
    });
    loadLogsAction({ fromDate: filters.fromDate, toDate: filters.toDate }).then((result) => {
      if (isCurrent) applyResult(result);
    });
    return () => {
      isCurrent = false;
    };
    // โหลดครั้งแรกครั้งเดียว — หลังจากนั้นโหลดเมื่อกดค้นหา
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadActorsAction, loadLogsAction, applyResult]);

  const runSearch = async () => {
    setIsLoading(true);
    setExpandedId(null);
    applyResult(
      await loadLogsAction({
        fromDate: filters.fromDate || null,
        toDate: filters.toDate || null,
        action: filters.action || null,
        actorId: filters.actorId || null,
        keyword: filters.keyword || null,
      })
    );
  };

  const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">ประวัติการทำงาน</h1>
        <p className="text-sm text-ink-muted">
          ใคร ทำอะไร เมื่อไหร่ เหตุผลอะไร
          {staffRole === 'manager' && ' · ผู้จัดการไม่เห็นรายการที่แอดมินเป็นผู้ทำ'}
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-3xl bg-white p-3 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ตั้งแต่</span>
          <input type="date" className={INPUT_CLASS} value={filters.fromDate} onChange={(e) => setFilter('fromDate', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ถึง</span>
          <input type="date" className={INPUT_CLASS} value={filters.toDate} onChange={(e) => setFilter('toDate', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">เหตุการณ์</span>
          <select className={INPUT_CLASS} value={filters.action} onChange={(e) => setFilter('action', e.target.value)}>
            <option value="">ทั้งหมด</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">ผู้ทำรายการ</span>
          <select className={INPUT_CLASS} value={filters.actorId} onChange={(e) => setFilter('actorId', e.target.value)}>
            <option value="">ทุกคน</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.full_name} ({ROLE_LABELS[actor.role] ?? actor.role})
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-semibold">ค้นหาในเหตุผล</span>
          <span className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              className={cn(INPUT_CLASS, 'w-full pl-9')}
              value={filters.keyword}
              onChange={(e) => setFilter('keyword', e.target.value)}
              placeholder="เช่น ของหมด"
            />
          </span>
        </label>
        <Button type="submit" icon={Search} isLoading={isLoading}>
          ค้นหา
        </Button>
      </form>

      <AlertMessage>{pageError}</AlertMessage>
      {isTruncated && <AlertMessage>แสดง 300 รายการล่าสุด — กรองให้แคบลงเพื่อดูรายการเก่ากว่านี้</AlertMessage>}

      {isLoading && logs.length === 0 ? (
        <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden />
      ) : logs.length === 0 ? (
        <p className="rounded-3xl bg-white p-10 text-center text-ink-muted">ไม่พบประวัติตามเงื่อนไข</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">เวลา</th>
                <th className="px-4 py-3 font-semibold">ผู้ทำรายการ</th>
                <th className="px-4 py-3 font-semibold">เหตุการณ์</th>
                <th className="px-4 py-3 font-semibold">เหตุผล</th>
                <th className="px-4 py-3" aria-label="รายละเอียด" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const hasDetail = log.payloadBefore || log.payloadAfter;
                return (
                  <Fragment key={log.id}>
                    <tr className={cn(HIGHLIGHT_ACTIONS.has(log.action) && 'bg-primary/5')}>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{log.actorName}</span>
                        {log.actorRole && <span className="block text-xs text-ink-muted">{ROLE_LABELS[log.actorRole] ?? log.actorRole}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span>
                        <span className="block font-mono text-xs text-ink-muted">{log.targetEntity}</span>
                      </td>
                      <td className="px-4 py-3">{log.reason ?? <span className="text-ink-muted">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {hasDetail && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            aria-expanded={isExpanded}
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold text-ink-muted hover:bg-surface"
                          >
                            รายละเอียด
                            <ChevronDown className={cn('size-4 transition-transform', isExpanded && 'rotate-180')} aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-surface px-4 py-3">
                          <AuditChangeTable before={log.payloadBefore} after={log.payloadAfter} nameById={nameById} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
