import { useLocale, useTranslations } from 'next-intl';

/**
 * Hook for formatting dates, numbers, and relative times with proper localization
 */
export function useFormatters() {
  const locale = useLocale();
  const t = useTranslations();

  /**
   * Format currency amounts
   */
  const formatCurrency = (
    amount: number,
    currency = 'USD',
    options: Intl.NumberFormatOptions = {}
  ): string => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...options,
    }).format(amount);
  };

  /**
   * Format decimal numbers
   */
  const formatNumber = (
    value: number,
    options: Intl.NumberFormatOptions = {}
  ): string => {
    return new Intl.NumberFormat(locale, options).format(value);
  };

  /**
   * Format percentages
   */
  const formatPercent = (
    value: number,
    options: Intl.NumberFormatOptions = {}
  ): string => {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      ...options,
    }).format(value);
  };

  /**
   * Format dates
   */
  const formatDate = (
    date: Date | string | number,
    options: Intl.DateTimeFormatOptions = {}
  ): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
      
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  };

  /**
   * Format relative time (e.g., "2 hours ago", "in 3 days")
   */
  const formatRelativeTime = (date: Date | string | number): string => {
    const now = new Date();
    const targetDate = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
      
    const diffInSeconds = Math.floor((now.getTime() - targetDate.getTime()) / 1000);

    // Handle "now" case
    if (Math.abs(diffInSeconds) < 10) {
      return t('time.now');
    }

    const absDiff = Math.abs(diffInSeconds);
    const isPast = diffInSeconds > 0;

    // Less than a minute
    if (absDiff < 60) {
      return t('time.secondsAgo', { count: absDiff });
    }

    // Less than an hour
    const diffInMinutes = Math.floor(absDiff / 60);
    if (absDiff < 3600) {
      return t('time.minutesAgo', { count: diffInMinutes });
    }

    // Less than a day
    const diffInHours = Math.floor(absDiff / 3600);
    if (absDiff < 86400) {
      return t('time.hoursAgo', { count: diffInHours });
    }

    // Days
    const diffInDays = Math.floor(absDiff / 86400);
    if (absDiff < 604800) { // Less than a week
      return t('time.daysAgo', { count: diffInDays });
    }

    // For longer periods, use Intl.RelativeTimeFormat if available, 
    // otherwise fall back to regular date formatting
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      
      if (diffInDays < 30) {
        return rtf.format(isPast ? -diffInDays : diffInDays, 'day');
      } else if (diffInDays < 365) {
        const months = Math.floor(diffInDays / 30);
        return rtf.format(isPast ? -months : months, 'month');
      } else {
        const years = Math.floor(diffInDays / 365);
        return rtf.format(isPast ? -years : years, 'year');
      }
    } catch {
      // Fallback to date formatting if RelativeTimeFormat is not supported
      return formatDate(targetDate, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  /**
   * Format Stellar amounts (handle stroops to XLM conversion)
   */
  const formatStellarAmount = (
    stroops: string | number,
    options: { showCode?: boolean; precision?: number } = {}
  ): string => {
    const { showCode = true, precision = 7 } = options;
    const amount = typeof stroops === 'string' 
      ? parseFloat(stroops) 
      : stroops;
    
    const xlm = amount / 10000000; // Convert stroops to XLM
    const formatted = formatNumber(xlm, { 
      minimumFractionDigits: 0,
      maximumFractionDigits: precision,
    });

    return showCode ? `${formatted} XLM` : formatted;
  };

  /**
   * Format file sizes
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${formatNumber(bytes / Math.pow(k, i), { 
      maximumFractionDigits: 1 
    })} ${sizes[i]}`;
  };

  return {
    formatCurrency,
    formatNumber,
    formatPercent,
    formatDate,
    formatRelativeTime,
    formatStellarAmount,
    formatFileSize,
  };
}