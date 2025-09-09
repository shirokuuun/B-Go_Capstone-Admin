import { logSystemError } from '/src/pages/settings/auditService.js';

/**
 * Global error handler that automatically logs errors to the audit system
 */
class ErrorHandler {
  constructor() {
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    // Handle uncaught JavaScript errors
    window.addEventListener('error', (event) => {
      const error = new Error(event.message);
      error.stack = `${event.filename}:${event.lineno}:${event.colno}`;
      this.logError(error, 'Uncaught JavaScript Error', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(event.reason);
      this.logError(error, 'Unhandled Promise Rejection', {
        type: 'unhandledrejection'
      });
    });

    // Handle React errors (if using error boundaries)
    this.originalConsoleError = console.error;
    console.error = (...args) => {
      // Check if this looks like a React error
      const message = args.join(' ');
      if (message.includes('React') || message.includes('Warning:')) {
        const error = new Error(message);
        this.logError(error, 'React Error/Warning', {
          type: 'react',
          arguments: args
        });
      }
      
      // Call original console.error
      this.originalConsoleError.apply(console, args);
    };
  }

  async logError(error, context, additionalData = {}) {
    try {
      await logSystemError(error, context, additionalData);
    } catch (logError) {
      // Fallback logging if audit system fails
      console.error('Failed to log error to audit system:', logError);
      console.error('Original error:', error);
    }
  }

  // Manual error logging method
  async reportError(error, context, additionalData = {}) {
    return this.logError(error, context, additionalData);
  }
}

// Create global instance
const errorHandler = new ErrorHandler();

export default errorHandler;
export { ErrorHandler };