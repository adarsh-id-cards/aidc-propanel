/**
 * formatters.js — Shared utility functions for formatting dates, strings, and numbers.
 */

/**
 * Formats an ISO date string or Date object into DD/MM/YY HH:MM format.
 * @param {string|Date} str
 * @returns {string}
 */
export const formatDT = (str) => {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return String(str);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return String(str);
  }
};

/**
 * Formats a number with comma separators.
 * @param {number} num
 * @returns {string}
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('en-IN');
};

/**
 * Capitalizes the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export const capitalize = (str) => {
  if (!str) return '';
  return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
};

/**
 * Formats an ISO datetime string into human readable 12-hour AM/PM format (e.g. 29 Oct 09:00 AM).
 * @param {string} isoStr
 * @returns {string}
 */
export const formatDisplayDateTime = (isoStr) => {
  if (!isoStr) return '';
  try {
    const [datePart, timePart] = isoStr.includes('T') ? isoStr.split('T') : isoStr.split(' ');
    if (!datePart) return '';
    const [y, m, d] = datePart.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(m, 10) - 1] || m;
    let timeFormatted = '';
    if (timePart) {
      const [h24, min] = timePart.split(':');
      let h = parseInt(h24, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      timeFormatted = ` ${String(h).padStart(2, '0')}:${min} ${ampm}`;
    }
    return `${d} ${monthName}${timeFormatted}`;
  } catch (_) {
    return isoStr;
  }
};
