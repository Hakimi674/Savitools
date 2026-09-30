import { useTranslations } from 'next-intl';

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'INVALID_XDR'
  | 'INSUFFICIENT_FUNDS'
  | 'ACCOUNT_NOT_FOUND'
  | 'CONTRACT_NOT_FOUND'
  | 'INVALID_ADDRESS'
  | 'SIGNATURE_REQUIRED'
  | 'MULTISIG_THRESHOLD'
  | 'GENERIC';

/**
 * Hook to translate error messages based on error codes
 */
export function useErrorMessages() {
  const t = useTranslations('errors');

  const translateError = (error: any): string => {
    // Handle API errors with error codes
    if (error?.code) {
      switch (error.code) {
        case 'NETWORK_ERROR':
          return t('network');
        case 'VALIDATION_ERROR':
          return t('validation');
        case 'UNAUTHORIZED':
          return t('unauthorized');
        case 'FORBIDDEN':
          return t('forbidden');
        case 'NOT_FOUND':
          return t('notFound');
        case 'TIMEOUT':
          return t('timeout');
        case 'SERVER_ERROR':
          return t('serverError');
        case 'INVALID_XDR':
          return t('invalidXdr');
        case 'INSUFFICIENT_FUNDS':
          return t('insufficientFunds');
        case 'ACCOUNT_NOT_FOUND':
          return t('accountNotFound');
        case 'CONTRACT_NOT_FOUND':
          return t('contractNotFound');
        case 'INVALID_ADDRESS':
          return t('invalidAddress');
        case 'SIGNATURE_REQUIRED':
          return t('signatureRequired');
        case 'MULTISIG_THRESHOLD':
          return t('multisigThreshold');
        default:
          return t('generic');
      }
    }

    // Handle HTTP status codes
    if (error?.status || error?.statusCode) {
      const status = error.status || error.statusCode;
      switch (status) {
        case 400:
          return t('validation');
        case 401:
          return t('unauthorized');
        case 403:
          return t('forbidden');
        case 404:
          return t('notFound');
        case 408:
        case 504:
          return t('timeout');
        case 500:
        case 502:
        case 503:
          return t('serverError');
        default:
          if (status >= 500) {
            return t('serverError');
          }
          return t('generic');
      }
    }

    // Handle network errors
    if (error?.name === 'NetworkError' || error?.message?.includes('fetch')) {
      return t('network');
    }

    // Handle Stellar SDK errors
    if (error?.message?.includes('invalid sequence number')) {
      return t('validation');
    }
    if (error?.message?.includes('insufficient balance')) {
      return t('insufficientFunds');
    }
    if (error?.message?.includes('account not found')) {
      return t('accountNotFound');
    }

    // Fallback to generic error
    return error?.message || t('generic');
  };

  return { translateError };
}

/**
 * Utility function to extract error code from various error formats
 */
export function extractErrorCode(error: any): ErrorCode {
  if (error?.code) {
    return error.code;
  }

  if (error?.status || error?.statusCode) {
    const status = error.status || error.statusCode;
    switch (status) {
      case 400:
        return 'VALIDATION_ERROR';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 408:
      case 504:
        return 'TIMEOUT';
      case 500:
      case 502:
      case 503:
        return 'SERVER_ERROR';
      default:
        return 'GENERIC';
    }
  }

  if (error?.name === 'NetworkError' || error?.message?.includes('fetch')) {
    return 'NETWORK_ERROR';
  }

  return 'GENERIC';
}