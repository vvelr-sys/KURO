import { PENALTY_RATE_PER_100G } from './constants';

/**
 * Calculates 7% Inclusive VAT extracted from total amount.
 * Formula: VAT = totalAmount * 7 / 107 (rounded half-up to 2 decimal places)
 * 
 * @param {number} totalAmount 
 * @returns {number}
 */
export function calculateVat(totalAmount) {
  if (!totalAmount || totalAmount <= 0) return 0.00;
  return Math.round((totalAmount * 7.0 / 107.0) * 100) / 100;
}

/**
 * Calculates leftover meat penalty amount.
 * Formula: 100 THB per 100g (rounded up to next 100g)
 * 
 * @param {number} weightGrams 
 * @returns {number}
 */
export function calculateLeftoverPenalty(weightGrams) {
  if (!weightGrams || weightGrams <= 0) return 0.00;
  return Math.ceil(weightGrams / 100.0) * PENALTY_RATE_PER_100G;
}

/**
 * Formats a numeric value to Thai Baht currency display.
 * 
 * @param {number} amount 
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}
