// Utility functions for the B-GO Admin application

/**
 * Format currency amount to Philippine Peso
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Format date to readable string
 * @param {Date|string} date - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDate = (date, options = {}) => {
  const defaultOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  return new Intl.DateTimeFormat("en-US", {
    ...defaultOptions,
    ...options,
  }).format(new Date(date));
};

/**
 * Generate a unique session ID
 * @returns {string} Unique session ID
 */
export const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format (Philippines)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
export const isValidPhone = (phone) => {
  const phoneRegex = /^(\+63|0)[0-9]{10}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
};

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} True if successful
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch (fallbackErr) {
      document.body.removeChild(textArea);
      return false;
    }
  }
};

/**
 * Get payment method display name
 * @param {string} method - Payment method code
 * @returns {string} Display name for payment method
 */
export const getPaymentMethodName = (method) => {
  const methods = {
    card: "Credit/Debit Card",
    gcash: "GCash",
    paymaya: "PayMaya",
    grabpay: "GrabPay",
    shopeepay: "ShopeePay",
  };
  return methods[method] || method;
};

/**
 * Get payment status display name and color
 * @param {string} status - Payment status
 * @returns {object} Object with display name and color
 */
export const getPaymentStatusInfo = (status) => {
  const statusMap = {
    pending: { name: "Pending", color: "#ffc107" },
    paid: { name: "Paid", color: "#28a745" },
    failed: { name: "Failed", color: "#dc3545" },
    cancelled: { name: "Cancelled", color: "#6c757d" },
    refunded: { name: "Refunded", color: "#17a2b8" },
  };
  return statusMap[status] || { name: status, color: "#6c757d" };
};

/**
 * Calculate time difference in human readable format
 * @param {Date|string} date - Date to compare
 * @returns {string} Human readable time difference
 */
export const getTimeAgo = (date) => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000)
    return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
};

export default {
  formatCurrency,
  formatDate,
  generateSessionId,
  isValidEmail,
  isValidPhone,
  debounce,
  copyToClipboard,
  getPaymentMethodName,
  getPaymentStatusInfo,
  getTimeAgo,
};
