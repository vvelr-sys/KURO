'use server';

import { toDisplayError } from '@/lib/action-helpers';
import { checkActionRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROUTE_PERMISSIONS } from '@/lib/constants';
import { buildIngredientDaySummary, getBangkokToday, sortStockRows } from '@/lib/stock';
import { removeStoredImage, toStoragePath } from '@/lib/storage-image';

// Server Actions ของหน้าสต็อกผู้จัดการ (manager, admin)
const INVENTORY_ROLES = ROUTE_PERMISSIONS['/inventory'];

// Supabase ส่งกลับได้ครั้งละไม่เกิน 1,000 แถว — วันที่ขายดีอาจมีความเคลื่อนไหวมากกว่านั้น
const PAGE_SIZE = 1000;

/**
 * ดึงความเคลื่อนไหวสต็อกของวันนี้ทั้งหมด (ทีละหน้า)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dayStartIso
 */
async function fetchTodayMovements(supabase, dayStartIso) {
  const allMovements = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('ingredient_id, movement_type, quantity, created_at, stock_count_id')
      .gte('created_at', dayStartIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    allMovements.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return allMovements;
}

/**
 * สรุปสต็อกวันนี้ทุกวัตถุดิบ (ตารางสรุป) + จุดกราฟของวัตถุดิบที่เลือก
 *
 * @param {string|null} selectedIngredientId - วัตถุดิบที่กำลังดูกราฟ (null = ไม่ต้องส่งจุดกราฟ)
 * @returns {Promise<{ rows: Array<object>, dayStartIso: string, error: string|null }>}
 */
export async function getTodayStockSummary(selectedIngredientId = null) {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  const { dateText, dayStartIso } = getBangkokToday();
  if (roleError) return { rows: [], dayStartIso, error: roleError };

  const supabase = await createClient();

  try {
    const [ingredientsResult, countsResult, movements] = await Promise.all([
      supabase
        .from('ingredients')
        .select('id, name, unit, current_stock, minimum_threshold'),
      supabase
        .from('stock_counts')
        .select('id, count_round, created_at, stock_count_items (ingredient_id, counted_stock)')
        .eq('count_date', dateText)
        .eq('status', 'approved'),
      fetchTodayMovements(supabase, dayStartIso),
    ]);

    if (ingredientsResult.error) throw new Error(ingredientsResult.error.message);
    if (countsResult.error) throw new Error(countsResult.error.message);

    const approvedCounts = countsResult.data || [];
    const openingCount = approvedCounts.find((count) => count.count_round === 'opening') || null;
    const closingCount = approvedCounts.find((count) => count.count_round === 'closing') || null;

    // จัดกลุ่มความเคลื่อนไหวตามวัตถุดิบ
    const movementsByIngredient = new Map();
    for (const movement of movements) {
      if (!movementsByIngredient.has(movement.ingredient_id)) {
        movementsByIngredient.set(movement.ingredient_id, []);
      }
      movementsByIngredient.get(movement.ingredient_id).push(movement);
    }

    /** หายอดนับของวัตถุดิบหนึ่งในรอบที่อนุมัติแล้ว */
    const findCountedItem = (count, ingredientId) => {
      if (!count) return null;
      const item = count.stock_count_items.find((row) => row.ingredient_id === ingredientId);
      return item ? { id: count.id, created_at: count.created_at, counted_stock: item.counted_stock } : null;
    };

    const rows = (ingredientsResult.data || []).map((ingredient) =>
      buildIngredientDaySummary({
        ingredient,
        movements: movementsByIngredient.get(ingredient.id) || [],
        openingCount: findCountedItem(openingCount, ingredient.id),
        closingCount: findCountedItem(closingCount, ingredient.id),
        dayStartIso,
        includePoints: ingredient.id === selectedIngredientId,
      })
    );

    return { rows: sortStockRows(rows), dayStartIso, error: null };
  } catch (err) {
    return { rows: [], dayStartIso, error: toDisplayError(err, 'inventory summary') };
  }
}

/**
 * รายการผลนับที่รออนุมัติ พร้อมยอดระบบ ยอดนับ และผลต่าง
 * @returns {Promise<{ counts: Array<object>, error: string|null }>}
 */
export async function getPendingStockCounts() {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { counts: [], error: roleError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_counts')
    .select(`
      id,
      count_date,
      count_round,
      created_at,
      counter:profiles!stock_counts_counted_by_fkey ( full_name ),
      stock_count_items (
        id,
        system_stock,
        counted_stock,
        discrepancy,
        adjustment_reason,
        ingredients ( name, unit )
      )
    `)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });

  if (error) return { counts: [], error: toDisplayError(error, 'inventory pending') };

  const counts = (data || []).map((count) => ({
    id: count.id,
    countDate: count.count_date,
    countRound: count.count_round,
    createdAt: count.created_at,
    counterName: count.counter?.full_name ?? '-',
    items: (count.stock_count_items || [])
      .map((item) => ({
        id: item.id,
        name: item.ingredients?.name ?? '-',
        unit: item.ingredients?.unit ?? '',
        systemStock: Number(item.system_stock),
        countedStock: Number(item.counted_stock),
        discrepancy: Number(item.discrepancy),
        reason: item.adjustment_reason,
      }))
      // รายการที่ต่างมากขึ้นก่อน
      .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy)),
  }));

  return { counts, error: null };
}

/**
 * อนุมัติ (ปรับยอดตามผลต่าง) หรือปฏิเสธผลนับ
 * ฐานข้อมูลตรวจซ้ำ: เฉพาะ manager / admin (admin ต้องมีเหตุผล), ปฏิเสธต้องมีเหตุผล
 *
 * @param {string} stockCountId
 * @param {boolean} approve
 * @param {string|null} reason
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function reviewStockCount(stockCountId, approve, reason = null) {
  const { staff, error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { success: false, error: roleError };

  const trimmedReason = reason?.trim() || null;
  if (!approve && !trimmedReason) {
    return { success: false, error: 'กรุณาระบุเหตุผลที่ปฏิเสธ' };
  }
  if (staff.role === 'admin' && !trimmedReason) {
    return { success: false, error: 'แอดมินอนุมัติได้เฉพาะกรณีฉุกเฉิน กรุณาระบุเหตุผล' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_review_stock_count', {
    p_stock_count_id: stockCountId,
    p_approve: Boolean(approve),
    p_reason: trimmedReason,
  });

  if (error) return { success: false, error: toDisplayError(error, 'inventory review') };
  return { success: true, error: null };
}

// ════════════════════════════════════════════════════════════════════════
// T-08: จัดการวัตถุดิบ / สูตร BOM / ประวัติความเคลื่อนไหว / ปรับยอดฉุกเฉิน
// ════════════════════════════════════════════════════════════════════════

/**
 * รายการวัตถุดิบทั้งหมด (เรียงตามชื่อ) พร้อมเมนูที่ใช้วัตถุดิบนั้นในสูตร BOM
 * - used_in_menus: เมนูที่ใช้ (สูตรสั้นสุดก่อน) — ว่าง = วัตถุดิบนี้ไม่ถูกตัดสต็อกจากการขายเลย
 * - display_image_url: รูปวัตถุดิบเอง หรือถ้าไม่มี ใช้รูปเมนูแรกใน used_in_menus ที่มีรูป (กติกาเดียวกับ migration 026)
 * - image_from_menu: ชื่อเมนูที่ยืมรูปมา (null = รูปของวัตถุดิบเอง / ไม่มีรูป)
 * @returns {Promise<{ ingredients: Array<object>, error: string|null }>}
 */
export async function getIngredients() {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { ingredients: [], error: roleError };

  const supabase = await createClient();
  const [ingredientResult, bomResult] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, minimum_threshold, image_url')
      .order('name', { ascending: true }),
    supabase.from('menu_ingredients').select('menu_item_id, ingredient_id, menu_items ( id, name, image_url )'),
  ]);

  const firstError = ingredientResult.error ?? bomResult.error;
  if (firstError) return { ingredients: [], error: toDisplayError(firstError, 'inventory ingredients') };

  // จำนวนวัตถุดิบในสูตรของแต่ละเมนู (ใช้เรียง: เมนูที่ใช้วัตถุดิบน้อยสุดก่อน = รูปตรงกับวัตถุดิบที่สุด)
  const recipeSizeByMenu = new Map();
  for (const row of bomResult.data ?? []) {
    recipeSizeByMenu.set(row.menu_item_id, (recipeSizeByMenu.get(row.menu_item_id) ?? 0) + 1);
  }

  const ingredients = (ingredientResult.data ?? []).map((ingredient) => {
    const usedInMenus = (bomResult.data ?? [])
      .filter((row) => row.ingredient_id === ingredient.id && row.menu_items)
      .map((row) => ({
        id: row.menu_items.id,
        name: row.menu_items.name,
        image_url: row.menu_items.image_url,
        recipe_size: recipeSizeByMenu.get(row.menu_item_id) ?? 1,
      }))
      // สูตรสั้นสุดก่อน · เท่ากันเรียงตาม id (ให้ตรงกับ fn_ingredients_for_count ใน migration 028)
      .sort((first, second) => first.recipe_size - second.recipe_size || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
    const imageMenu = ingredient.image_url ? null : usedInMenus.find((menu) => menu.image_url) ?? null;

    return {
      ...ingredient,
      used_in_menus: usedInMenus,
      display_image_url: ingredient.image_url ?? imageMenu?.image_url ?? null,
      image_from_menu: imageMenu?.name ?? null,
    };
  });

  return { ingredients, error: null };
}

/**
 * เพิ่ม/แก้วัตถุดิบ (ชื่อ, หน่วย, จุดสั่งซื้อ, รูป) — ยอดคงเหลือแก้ที่นี่ไม่ได้
 * ยอดเปลี่ยนได้ผ่าน รับของเข้า / ของเสีย / อนุมัติผลนับ / ปรับฉุกเฉิน (มีประวัติทุกครั้ง)
 *
 * @param {{ id?: string|null, name: string, unit: string, minimumThreshold: number, imageUrl?: string|null }} input
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function saveIngredient({ id = null, name, unit, minimumThreshold, imageUrl = null }) {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { success: false, error: roleError };

  const trimmedName = name?.trim();
  const trimmedUnit = unit?.trim();
  const threshold = Number(minimumThreshold);
  if (!trimmedName) return { success: false, error: 'กรุณาใส่ชื่อวัตถุดิบ' };
  if (!trimmedUnit) return { success: false, error: 'กรุณาใส่หน่วยนับ' };
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { success: false, error: 'จุดสั่งซื้อต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
  }
  const cleanImageUrl = imageUrl || null;
  if (cleanImageUrl && !toStoragePath(cleanImageUrl)) return { success: false, error: 'รูปต้องอัปโหลดผ่านหน้านี้เท่านั้น' };

  const supabase = await createClient();
  const payload = { name: trimmedName, unit: trimmedUnit, minimum_threshold: threshold, image_url: cleanImageUrl };

  if (!id) {
    const { error } = await supabase.from('ingredients').insert({ ...payload, current_stock: 0 });
    if (error) return { success: false, error: toDisplayError(error, 'inventory save ingredient') };
    return { success: true, error: null };
  }

  const { data: before } = await supabase.from('ingredients').select('image_url').eq('id', id).maybeSingle();
  const { error } = await supabase.from('ingredients').update(payload).eq('id', id);
  if (error) return { success: false, error: toDisplayError(error, 'inventory save ingredient') };

  // เปลี่ยน/เอารูปออก → ลบไฟล์เก่าออกจาก Storage
  if (before?.image_url && before.image_url !== cleanImageUrl) await removeStoredImage(supabase, before.image_url);
  return { success: true, error: null };
}

/**
 * ข้อมูลหน้าสูตร BOM: เมนูทั้งหมด + สูตรทั้งหมด + วัตถุดิบ
 * @returns {Promise<{ menus: Array<object>, bomRows: Array<object>, ingredients: Array<object>, error: string|null }>}
 */
export async function getBomData() {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { menus: [], bomRows: [], ingredients: [], error: roleError };

  const supabase = await createClient();
  const [menusResult, bomResult, ingredientsResult] = await Promise.all([
    supabase
      .from('menu_items')
      .select('id, name, kitchen_station, availability_status, categories(name)')
      .order('name', { ascending: true }),
    supabase.from('menu_ingredients').select('menu_item_id, ingredient_id, quantity_required'),
    supabase.from('ingredients').select('id, name, unit, current_stock').order('name', { ascending: true }),
  ]);

  const firstError = menusResult.error ?? bomResult.error ?? ingredientsResult.error;
  if (firstError) {
    return { menus: [], bomRows: [], ingredients: [], error: toDisplayError(firstError, 'inventory bom load') };
  }

  return {
    menus: menusResult.data ?? [],
    bomRows: bomResult.data ?? [],
    ingredients: ingredientsResult.data ?? [],
    error: null,
  };
}

/**
 * บันทึกสูตร BOM ของเมนู 1 รายการ (แทนที่สูตรเดิมทั้งชุด)
 * ฐานข้อมูลตรวจสถานะเมนูใหม่ให้เอง (FR-024: วัตถุดิบไม่พอ 1 จาน → หมด)
 *
 * @param {string} menuItemId
 * @param {Array<{ ingredientId: string, quantity: number }>} rows - วัตถุดิบและปริมาณต่อ 1 จาน
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function saveMenuBom(menuItemId, rows) {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { success: false, error: roleError };

  if (!menuItemId) return { success: false, error: 'ไม่พบเมนู' };
  if (!Array.isArray(rows)) return { success: false, error: 'ข้อมูลสูตรไม่ถูกต้อง' };

  const ingredientIds = new Set();
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (!row.ingredientId) return { success: false, error: 'กรุณาเลือกวัตถุดิบให้ครบทุกแถว' };
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, error: 'ปริมาณต่อจานต้องมากกว่า 0' };
    }
    if (ingredientIds.has(row.ingredientId)) {
      return { success: false, error: 'มีวัตถุดิบซ้ำในสูตร กรุณารวมเป็นแถวเดียว' };
    }
    ingredientIds.add(row.ingredientId);
  }

  const supabase = await createClient();

  // 1) ลบวัตถุดิบที่ไม่อยู่ในสูตรใหม่
  let deleteQuery = supabase.from('menu_ingredients').delete().eq('menu_item_id', menuItemId);
  if (ingredientIds.size > 0) {
    deleteQuery = deleteQuery.not('ingredient_id', 'in', `(${[...ingredientIds].join(',')})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return { success: false, error: toDisplayError(deleteError, 'inventory bom delete') };

  // 2) เพิ่ม/แก้ปริมาณที่เหลือ
  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from('menu_ingredients').upsert(
      rows.map((row) => ({
        menu_item_id: menuItemId,
        ingredient_id: row.ingredientId,
        quantity_required: Number(row.quantity),
      })),
      { onConflict: 'menu_item_id,ingredient_id' }
    );
    if (upsertError) return { success: false, error: toDisplayError(upsertError, 'inventory bom upsert') };
  }

  return { success: true, error: null };
}

/**
 * ประวัติความเคลื่อนไหวสต็อก (FR-033) ล่าสุดก่อน
 * @param {{ ingredientId?: string|null, movementType?: string|null, fromDate?: string|null, toDate?: string|null }} filters
 *        fromDate / toDate รูปแบบ YYYY-MM-DD (วันตามเวลาไทย)
 * @returns {Promise<{ movements: Array<object>, isTruncated: boolean, error: string|null }>}
 */
export async function getStockMovements({ ingredientId = null, movementType = null, fromDate = null, toDate = null } = {}) {
  const { error: roleError } = await checkActionRole(INVENTORY_ROLES);
  if (roleError) return { movements: [], isTruncated: false, error: roleError };

  const MAX_ROWS = 300;
  const supabase = await createClient();
  let query = supabase
    .from('stock_movements')
    .select(`
      id, movement_type, quantity, balance_after, reason, created_at, order_item_id,
      ingredients ( name, unit ),
      creator:profiles!stock_movements_created_by_fkey ( full_name )
    `)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS + 1);

  if (ingredientId) query = query.eq('ingredient_id', ingredientId);
  if (movementType) query = query.eq('movement_type', movementType);
  if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00+07:00`);
  if (toDate) query = query.lte('created_at', `${toDate}T23:59:59.999+07:00`);

  const { data, error } = await query;
  if (error) return { movements: [], isTruncated: false, error: toDisplayError(error, 'inventory movements') };

  const rows = data ?? [];
  return {
    movements: rows.slice(0, MAX_ROWS).map((row) => ({
      id: row.id,
      movementType: row.movement_type,
      quantity: Number(row.quantity),
      balanceAfter: Number(row.balance_after),
      reason: row.reason,
      createdAt: row.created_at,
      ingredientName: row.ingredients?.name ?? '-',
      unit: row.ingredients?.unit ?? '',
      creatorName: row.creator?.full_name ?? '-',
    })),
    isTruncated: rows.length > MAX_ROWS,
    error: null,
  };
}

/**
 * Admin ปรับยอดสต็อกฉุกเฉิน (ตั้งยอดใหม่ + เหตุผลบังคับ) — บันทึก Audit EMERGENCY_OVERRIDE
 * @param {string} ingredientId
 * @param {number} newStock
 * @param {string} reason
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function emergencyAdjustStock(ingredientId, newStock, reason) {
  const { error: roleError } = await checkActionRole(['admin']);
  if (roleError) return { success: false, error: roleError };

  const amount = Number(newStock);
  if (!Number.isFinite(amount) || amount < 0) return { success: false, error: 'ยอดใหม่ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
  if (!reason?.trim()) return { success: false, error: 'กรุณาระบุเหตุผลการปรับยอดฉุกเฉิน' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_emergency_adjust_stock', {
    p_ingredient_id: ingredientId,
    p_new_stock: amount,
    p_reason: reason.trim(),
  });

  if (error) return { success: false, error: toDisplayError(error, 'inventory emergency adjust') };
  return { success: true, error: null };
}
