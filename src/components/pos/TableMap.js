'use client';

import { useCallback, useMemo, useOptimistic, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import {
  markTableCleaned,
  moveTable,
  openTable,
  recordLeftover,
  reissueQr,
  setTableDisabled,
  startClosing,
} from '@/app/(pos)/tables/actions';
import { AlertMessage } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableRealtime } from '@/hooks/useTableRealtime';
import { TABLE_SIZES, getTableSizeKey } from '@/lib/constants';
import { cn } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import MoveTableDialog from './MoveTableDialog';
import OpenTableDialog from './OpenTableDialog';
import QrTicketDialog from './QrTicketDialog';
import TableCard from './TableCard';
import TableDetailPanel from './TableDetailPanel';
import TableSummaryCards from './TableSummaryCards';

/**
 * อัปเดตหน้าจอทันทีก่อนเซิร์ฟเวอร์ตอบ (Optimistic UI)
 * ถ้าเซิร์ฟเวอร์ตอบ error → React คืนค่าเดิมให้เอง / ถ้าสำเร็จ → ข้อมูลจริงจาก refresh() มาแทน
 * @param {import('@/app/(pos)/tables/data').TableItem[]} tables
 * @param {{ type: string, [key: string]: any }} change
 */
function applyTableChange(tables, change) {
  switch (change.type) {
    case 'setTableStatus':
      return tables.map((table) => (table.id === change.tableId ? { ...table, status: change.status } : table));
    case 'openTable':
      return tables.map((table) =>
        table.id === change.tableId ? { ...table, status: 'occupied', session: change.session } : table
      );
    case 'moveTable': {
      const fromTable = tables.find((table) => table.id === change.fromTableId);
      return tables.map((table) => {
        if (table.id === change.fromTableId) return { ...table, status: 'cleaning', session: null };
        if (table.id === change.toTableId) return { ...table, status: 'occupied', session: fromTable?.session ?? null };
        return table;
      });
    }
    case 'setSessionStatus':
      return tables.map((table) =>
        table.id === change.tableId && table.session
          ? { ...table, session: { ...table.session, status: change.status } }
          : table
      );
    default:
      return tables;
  }
}

/**
 * หน้าผังโต๊ะทั้งหน้า (ฝั่ง Client)
 * @param {Object} props
 * @param {import('@/app/(pos)/tables/data').TableItem[]} props.tables
 * @param {import('@/app/(pos)/tables/data').CalledQueue[]} props.calledQueues
 * @param {{ name: string, adultPrice: number, childPrice: number, durationMinutes: number } | null} props.activePackage
 * @param {{ canOpenTable: boolean, canDisableTable: boolean, canBill: boolean }} props.permissions
 */
export default function TableMap({ tables, calledQueues, activePackage, permissions }) {
  useTableRealtime();

  const [optimisticTables, applyOptimistic] = useOptimistic(tables, applyTableChange);
  const [, startTransition] = useTransition();

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [sizeFilter, setSizeFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText.trim().toUpperCase(), 200);
  /** @type {[{ type: 'open'|'move'|'closing'|'disable'|'enable', tableId: string } | null, Function]} */
  const [dialog, setDialog] = useState(null);
  const [qrTicket, setQrTicket] = useState(/** @type {{ ticket: any, note?: string } | null} */ (null));
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [pageError, setPageError] = useState(null);

  /**
   * เรียก Server Action พร้อมอัปเดตหน้าจอทันที (optimistic) แล้วรอผลจริง
   * @param {object|null} optimisticChange
   * @param {() => Promise<any>} callServer
   * @returns {Promise<any>} ผลลัพธ์จาก Server Action
   */
  const runWithOptimistic = useCallback(
    (optimisticChange, callServer) =>
      new Promise((resolve) => {
        startTransition(async () => {
          if (optimisticChange) applyOptimistic(optimisticChange);
          resolve(await callServer());
        });
      }),
    [applyOptimistic]
  );

  const tableById = useMemo(() => new Map(optimisticTables.map((table) => [table.id, table])), [optimisticTables]);
  const selectedTable = selectedTableId ? tableById.get(selectedTableId) ?? null : null;
  const dialogTable = dialog ? tableById.get(dialog.tableId) ?? null : null;

  const counts = useMemo(() => {
    const result = { total: optimisticTables.length, occupied: 0, available: 0, cleaning: 0, disabled: 0 };
    for (const table of optimisticTables) result[table.status] += 1;
    return result;
  }, [optimisticTables]);

  // กรองตามขนาดโต๊ะ + ค้นหาเลขโต๊ะ แล้วจัดกลุ่มตามขนาด
  const tableGroups = useMemo(() => {
    const matchedTables = optimisticTables.filter(
      (table) =>
        (sizeFilter === 'all' || getTableSizeKey(table.capacity) === sizeFilter) &&
        (debouncedSearch === '' || table.tableNumber.toUpperCase().includes(debouncedSearch))
    );
    return TABLE_SIZES.map((size) => ({
      ...size,
      tables: matchedTables.filter((table) => getTableSizeKey(table.capacity) === size.key),
    })).filter((group) => group.tables.length > 0);
  }, [optimisticTables, sizeFilter, debouncedSearch]);

  const sizeCounts = useMemo(() => {
    const result = { all: optimisticTables.length };
    for (const table of optimisticTables) {
      const key = getTableSizeKey(table.capacity);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }, [optimisticTables]);

  const availableTables = useMemo(
    () => optimisticTables.filter((table) => table.status === 'available' && !table.session),
    [optimisticTables]
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  // ===== ปุ่มลัดบนการ์ด (ส่งให้ TableCard ที่เป็น memo → ต้องเป็นฟังก์ชันเดิมทุก render) =====
  const handleQuickOpen = useCallback((tableId) => {
    setSelectedTableId(tableId);
    setDialog({ type: 'open', tableId });
  }, []);

  const handleQuickClean = useCallback(
    async (tableId) => {
      setPageError(null);
      const result = await runWithOptimistic({ type: 'setTableStatus', tableId, status: 'available' }, () =>
        markTableCleaned({ tableId })
      );
      if (result.error) setPageError(result.error);
    },
    [runWithOptimistic]
  );

  // ===== งานจากหน้าต่าง (คืน error ให้หน้าต่างแสดง หรือ null ถ้าสำเร็จ) =====
  const submitOpenTable = async ({ adultCount, childCount, queueId }) => {
    const table = dialogTable;
    const optimisticSession = activePackage && {
      id: 'pending',
      status: 'active',
      adultCount,
      childCount,
      adultPrice: activePackage.adultPrice,
      childPrice: activePackage.childPrice,
      buffetTotal: adultCount * activePackage.adultPrice + childCount * activePackage.childPrice,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + activePackage.durationMinutes * 60 * 1000).toISOString(),
      orderedCount: 0,
      pendingCount: 0,
      leftover: null,
    };
    const result = await runWithOptimistic({ type: 'openTable', tableId: table.id, session: optimisticSession }, () =>
      openTable({ tableId: table.id, tableNumber: table.tableNumber, adultCount, childCount, queueId })
    );
    if (result.error) return result.error;
    setDialog(null);
    setQrTicket({ ticket: result.ticket });
    return null;
  };

  const submitMoveTable = async (toTable) => {
    const fromTable = dialogTable;
    const result = await runWithOptimistic(
      { type: 'moveTable', fromTableId: fromTable.id, toTableId: toTable.id },
      () => moveTable({ sessionId: fromTable.session.id, fromTableId: fromTable.id, toTableId: toTable.id })
    );
    if (result.error) return result.error;
    setDialog(null);
    setSelectedTableId(toTable.id);
    // QR เดิมมีเลขโต๊ะเก่า → สร้าง QR ใหม่ให้พิมพ์ทันที (รอบที่เชิญออกแล้วไม่ต้องใช้ QR)
    if (fromTable.session.status === 'active' || fromTable.session.status === 'expired') {
      const qrResult = await reissueQr({ sessionId: fromTable.session.id, tableNumber: toTable.tableNumber });
      if (qrResult.ticket) {
        setQrTicket({ ticket: qrResult.ticket, note: `ย้ายจากโต๊ะ ${fromTable.tableNumber} แล้ว — พิมพ์ QR ใหม่ให้ลูกค้า` });
      }
    }
    return null;
  };

  const submitStartClosing = async () => {
    const table = dialogTable;
    const result = await runWithOptimistic({ type: 'setSessionStatus', tableId: table.id, status: 'closing' }, () =>
      startClosing({ sessionId: table.session.id })
    );
    if (result.error) return result.error;
    setDialog(null);
    return null;
  };

  const submitToggleDisabled = async (reason) => {
    const table = dialogTable;
    const disabled = dialog.type === 'disable';
    const result = await runWithOptimistic(
      { type: 'setTableStatus', tableId: table.id, status: disabled ? 'disabled' : 'available' },
      () => setTableDisabled({ tableId: table.id, disabled, reason })
    );
    if (result.error) return result.error;
    setDialog(null);
    return null;
  };

  // ===== ปุ่มในแผงรายละเอียด =====
  const panelHandlers = {
    onOpen: () => setDialog({ type: 'open', tableId: selectedTable.id }),
    onMove: () => setDialog({ type: 'move', tableId: selectedTable.id }),
    onStartClosing: () => setDialog({ type: 'closing', tableId: selectedTable.id }),
    onToggleDisabled: () =>
      setDialog({ type: selectedTable.status === 'disabled' ? 'enable' : 'disable', tableId: selectedTable.id }),
    onClean: () => handleQuickClean(selectedTable.id),
    onReprintQr: async () => {
      setIsQrLoading(true);
      setPageError(null);
      const result = await reissueQr({ sessionId: selectedTable.session.id, tableNumber: selectedTable.tableNumber });
      setIsQrLoading(false);
      if (result.error) setPageError(result.error);
      else setQrTicket({ ticket: result.ticket });
    },
    onRecordLeftover: async (weightGrams) => {
      const result = await recordLeftover({ sessionId: selectedTable.session.id, weightGrams });
      return result.error;
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <TableSummaryCards counts={counts} />

      {/* ตัวกรองขนาดโต๊ะ + ค้นหา */}
      <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        {[{ key: 'all', label: 'ทุกขนาด' }, ...TABLE_SIZES].map((size) => (
          <button
            key={size.key}
            type="button"
            onClick={() => setSizeFilter(size.key)}
            aria-pressed={sizeFilter === size.key}
            className={cn(
              'h-11 rounded-full px-4 font-semibold transition-colors',
              sizeFilter === size.key ? 'bg-primary text-white' : 'bg-surface text-ink hover:bg-primary/5'
            )}
          >
            {size.label}
            {size.seatLabel && <span className="ml-1 text-sm font-normal opacity-80">({size.seatLabel})</span>}
            <span className="ml-1.5 text-sm opacity-80">{sizeCounts[size.key] ?? 0}</span>
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="ค้นหาเลขโต๊ะ…"
            aria-label="ค้นหาเลขโต๊ะ"
            className="h-11 w-full rounded-full bg-surface pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </div>

      <AlertMessage>{pageError}</AlertMessage>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ผังโต๊ะ */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {tableGroups.length === 0 && (
            <p className="rounded-3xl bg-white p-8 text-center text-ink-muted">ไม่พบโต๊ะที่ตรงกับเงื่อนไข</p>
          )}
          {tableGroups.map((group) => (
            <section key={group.key} aria-labelledby={`table-group-${group.key}`}>
              <h2 id={`table-group-${group.key}`} className="mb-3 flex items-baseline gap-2 text-xl font-bold">
                <span className="h-6 w-1.5 self-center rounded-full bg-primary" aria-hidden />
                {group.label}
                <span className="text-sm font-normal text-ink-muted">
                  {group.seatLabel} · {group.tables.length} โต๊ะ
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {group.tables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    isSelected={table.id === selectedTableId}
                    canOpenTable={permissions.canOpenTable}
                    onSelect={setSelectedTableId}
                    onQuickOpen={handleQuickOpen}
                    onQuickClean={handleQuickClean}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* แผงรายละเอียดโต๊ะที่เลือก */}
        <aside className="w-full lg:sticky lg:top-24 lg:w-96 lg:shrink-0">
          <TableDetailPanel
            table={selectedTable}
            permissions={permissions}
            handlers={panelHandlers}
            isQrLoading={isQrLoading}
          />
        </aside>
      </div>

      {/* ===== หน้าต่างต่างๆ ===== */}
      {dialog?.type === 'open' && dialogTable && (
        <OpenTableDialog
          table={dialogTable}
          calledQueues={calledQueues}
          activePackage={activePackage}
          onClose={closeDialog}
          onSubmit={submitOpenTable}
        />
      )}
      {dialog?.type === 'move' && dialogTable?.session && (
        <MoveTableDialog
          fromTable={dialogTable}
          availableTables={availableTables}
          onClose={closeDialog}
          onSubmit={submitMoveTable}
        />
      )}
      {dialog?.type === 'closing' && dialogTable?.session && (
        <ConfirmDialog
          title={`เชิญลูกค้าโต๊ะ ${dialogTable.tableNumber} ออก`}
          message="ลูกค้าจะสั่งอาหารเพิ่มไม่ได้ และย้อนกลับไม่ได้ จากนั้นชั่งเนื้อเหลือแล้วส่งต่อแคชเชียร์คิดเงิน"
          confirmLabel="ยืนยันเชิญออก"
          onClose={closeDialog}
          onConfirm={submitStartClosing}
        />
      )}
      {(dialog?.type === 'disable' || dialog?.type === 'enable') && dialogTable && (
        <ConfirmDialog
          title={`${dialog.type === 'disable' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}โต๊ะ ${dialogTable.tableNumber}`}
          message={
            dialog.type === 'disable'
              ? 'โต๊ะจะเปิดให้ลูกค้าไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง'
              : 'โต๊ะจะกลับมาเป็น "ว่าง" พร้อมเปิดให้ลูกค้า'
          }
          confirmLabel={dialog.type === 'disable' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          confirmVariant={dialog.type === 'disable' ? 'danger' : 'success'}
          reasonLabel="เหตุผล (ไม่บังคับ) เช่น เตาชำรุด"
          onClose={closeDialog}
          onConfirm={submitToggleDisabled}
        />
      )}
      <QrTicketDialog ticket={qrTicket?.ticket ?? null} note={qrTicket?.note} onClose={() => setQrTicket(null)} />
    </div>
  );
}
