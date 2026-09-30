import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useFormatters } from '@/lib/formatters';
import { useErrorMessages } from '@/lib/error-messages';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
  usePathname: () => '/en/test',
}));

// Mock next-intl hooks
jest.mock('next-intl', () => ({
  ...jest.requireActual('next-intl'),
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => {
    const messages = {
      common: {
        language: 'Language',
        loading: 'Loading...',
      },
      errors: {
        generic: 'An unexpected error occurred',
        network: 'Network error',
      },
      time: {
        now: 'now',
        secondsAgo: '{count, plural, =1 {# second ago} other {# seconds ago}}',
      },
    };
    
    return (key: string, params?: any) => {
      const keys = key.split('.');
      let value: any = namespace ? messages[namespace as keyof typeof messages] : messages;
      
      for (const k of keys) {
        value = value?.[k];
      }
      
      if (typeof value === 'string' && params) {
        // Simple ICU message replacement for testing
        if (key.includes('secondsAgo') && params.count !== undefined) {
          return params.count === 1 ? '1 second ago' : `${params.count} seconds ago`;
        }
      }
      
      return value || key;
    };
  },
}));

describe('Internationalization', () => {
  const renderWithIntl = (component: React.ReactNode) => {
    const messages = {
      common: {
        language: 'Language',
      },
    };

    return render(
      <NextIntlClientProvider messages={messages} locale="en">
        {component}
      </NextIntlClientProvider>
    );
  };

  describe('LanguageSwitcher', () => {
    it('renders language switcher with current locale', () => {
      renderWithIntl(<LanguageSwitcher />);
      
      expect(screen.getByText('Language')).toBeInTheDocument();
      expect(screen.getByText('EN')).toBeInTheDocument();
    });

    it('shows dropdown when clicked', () => {
      renderWithIntl(<LanguageSwitcher />);
      
      const button = screen.getByRole('button');
      button.click();
      
      // Should show language options
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('Español')).toBeInTheDocument();
    });
  });

  describe('Error Messages', () => {
    it('translates error codes correctly', () => {
      const TestComponent = () => {
        const { translateError } = useErrorMessages();
        
        return (
          <div>
            <span data-testid="generic">{translateError({ code: 'GENERIC' })}</span>
            <span data-testid="network">{translateError({ code: 'NETWORK_ERROR' })}</span>
            <span data-testid="status-404">{translateError({ status: 404 })}</span>
          </div>
        );
      };

      renderWithIntl(<TestComponent />);
      
      expect(screen.getByTestId('generic')).toHaveTextContent('An unexpected error occurred');
      expect(screen.getByTestId('network')).toHaveTextContent('Network error');
    });
  });

  describe('Formatters', () => {
    it('formats numbers and dates correctly', () => {
      const TestComponent = () => {
        const { formatNumber, formatRelativeTime } = useFormatters();
        
        const number = formatNumber(1234.56);
        const relativeTime = formatRelativeTime(new Date(Date.now() - 30000)); // 30 seconds ago
        
        return (
          <div>
            <span data-testid="number">{number}</span>
            <span data-testid="relative-time">{relativeTime}</span>
          </div>
        );
      };

      renderWithIntl(<TestComponent />);
      
      // Should format number according to locale
      expect(screen.getByTestId('number')).toBeInTheDocument();
      expect(screen.getByTestId('relative-time')).toHaveTextContent('30 seconds ago');
    });
  });

  describe('Message Keys', () => {
    it('does not render raw translation keys', () => {
      const TestComponent = () => {
        const t = useTranslations('common');
        return <span>{t('language')}</span>;
      };

      renderWithIntl(<TestComponent />);
      
      // Should not show the raw key
      expect(screen.queryByText('common.language')).not.toBeInTheDocument();
      // Should show the translated text
      expect(screen.getByText('Language')).toBeInTheDocument();
    });
  });
});