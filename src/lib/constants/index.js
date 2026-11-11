/**
 * Core System Constants for KURO POS
 * Synced with Database Enums & SRS v1.7
 */

export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
  KITCHEN: 'kitchen',
  CASHIER: 'cashier',
};

export const TABLE_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  CLEANING: 'cleaning',
};

export const SESSION_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CLOSING: 'closing',
  BILLED: 'billed',
  CLOSED: 'closed',
};

export const ORDER_ITEM_STATUS = {
  SUBMITTED: 'submitted',
  ACCEPTED: 'accepted',
  COOKING: 'cooking',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled',
};

export const MENU_AVAILABILITY = {
  AVAILABLE: 'available',
  MANUAL_OFF: 'manual_off',
  AUTO_OFF: 'auto_off',
};

export const PAYMENT_METHODS = {
  CASH: 'cash',
  PROMPTPAY: 'promptpay',
};

export const HEIGHT_THRESHOLDS = {
  FREE_MAX_CM: 119.9,   // < 120 cm is free
  CHILD_MIN_CM: 120,   // 120 - 139.9 cm is child
  CHILD_MAX_CM: 139.9,
  ADULT_MIN_CM: 140,   // >= 140 cm is adult
};

export const PENALTY_RATE_PER_100G = 100.00;

export const MAX_PIN_FAILED_ATTEMPTS = 5;

