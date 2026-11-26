import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { toDisplayError } from '@/lib/action-helpers';

/**
 * @typedef {Object} CustomerServiceRequest
 * @property {string} id
 * @property {'call_staff'|'water'|'change_pot'|'check_bill'|'other'} requestType
 * @property {'pending'|'in_progress'} status
 * @property {string} createdAt - ISO
 */

/**
 * คำขอเรียกพนักงานที่ยังไม่เสร็จของโต๊ะนี้ (fn_customer_get_service_requests — migration 031)
 * @param {string} tokenHash
 * @param {string} tableNumber
 * @returns {Promise<{ requests: CustomerServiceRequest[], error: string|null }>}
 */
export async function getCustomerServiceRequests(tokenHash, tableNumber) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_customer_get_service_requests', {
    p_token_hash: tokenHash,
    p_table_number: tableNumber,
  });
  if (error) return { requests: [], error: toDisplayError(error, 'customer service requests') };

  const requests = (data ?? []).map((request) => ({
    id: request.id,
    requestType: request.request_type,
    status: request.status,
    createdAt: request.created_at,
  }));
  return { requests, error: null };
}
