'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';
import { locales, type Locale } from '@/i18n';
import { useState } from 'react';

const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const switchLocale = (newLocale: Locale) => {
    // Replace the current locale in the pathname with the new one
    const segments = pathname.split('/');
    if (segments[1] && locales.includes(segments[1] as Locale)) {
      segments[1] = newLocale; // Replace existing locale
    } else {
      segments.splice(1, 0, newLocale); // Insert locale if not present
    }
    const newPath = segments.join('/');
    router.replace(newPath);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Globe className="h-4 w-4" />
        <span className="hidden sm:inline">{t('language')}</span>
        <span className="uppercase">{locale}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 min-w-[120px] bg-background border border-border rounded-md shadow-lg z-50">
          {locales.map((availableLocale) => (
            <button
              key={availableLocale}
              onClick={() => switchLocale(availableLocale)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground first:rounded-t-md last:rounded-b-md ${
                locale === availableLocale ? 'bg-accent text-accent-foreground' : ''
              }`}
            >
              <span className="mr-2 text-xs uppercase">{availableLocale}</span>
              {localeNames[availableLocale]}
            </button>
          ))}
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}