/**
 * 全局 Toast 提示，统一风格，便于后续扩展
 */
import { toast as rhToast, type ToastOptions } from 'react-hot-toast'

const defaultSuccessOptions: ToastOptions = {
  duration: 2200,
  style: {
    background: 'linear-gradient(135deg, rgba(50,188,239,0.08) 0%, rgba(44,79,163,0.12) 100%)',
    borderLeft: '4px solid #32bcef',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(44,79,163,0.15)',
    padding: '14px 18px',
    fontSize: '15px',
    color: '#1f2937',
  },
  iconTheme: { primary: '#2c4fa3', secondary: '#fff' },
}

const defaultErrorOptions: ToastOptions = {
  duration: 2800,
  style: {
    background: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(185,28,28,0.12) 100%)',
    borderLeft: '4px solid #ef4444',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(239,68,68,0.15)',
    padding: '14px 18px',
    fontSize: '15px',
    color: '#1f2937',
  },
  iconTheme: { primary: '#dc2626', secondary: '#fff' },
}

export const toast = {
  success: (msg: string, opts?: ToastOptions) =>
    rhToast.success(msg, { ...defaultSuccessOptions, ...opts }),
  error: (msg: string, opts?: ToastOptions) =>
    rhToast.error(msg, { ...defaultErrorOptions, ...opts }),
  loading: rhToast.loading,
  dismiss: rhToast.dismiss,
  promise: rhToast.promise,
}

export default toast
