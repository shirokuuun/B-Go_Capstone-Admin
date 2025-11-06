// currency format
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// format date
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

// session id generator
export const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// validator email
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// validator phone number (Philippines)
export const isValidPhone = (phone) => {
  const phoneRegex = /^(\+63|0)[0-9]{10}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
};

// debounce function
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

// copy to clipboard
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

// Get payment method display name
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

// Get payment status info
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

// get time ago
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
