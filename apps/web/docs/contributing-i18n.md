# Internationalization (i18n) Contributing Guide

This guide explains how to add new translatable strings and locales to SaviTools.

## Overview

SaviTools uses `next-intl` for internationalization with the following structure:

- **Source locale**: English (`en`) - the primary locale with all keys
- **Message catalogues**: JSON files in `messages/` directory
- **Locale routing**: URLs prefixed with locale (e.g., `/en/composer`, `/es/composer`)
- **Translation validation**: Automated checks ensure all locales have complete translations

## Adding New Strings

### 1. Add to Source Locale (English)

All new strings must first be added to `messages/en.json`:

```json
{
  "myFeature": {
    "title": "My New Feature",
    "description": "This is a new feature",
    "actions": {
      "save": "Save Changes",
      "cancel": "Cancel"
    }
  }
}
```

### 2. Use in Components

Import and use the `useTranslations` hook:

```tsx
import { useTranslations } from 'next-intl';

function MyComponent() {
  const t = useTranslations('myFeature');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
      <button>{t('actions.save')}</button>
    </div>
  );
}
```

### 3. Update All Locales

After adding to English, update all other locale files (`es.json`, etc.) with translations:

```json
{
  "myFeature": {
    "title": "Mi Nueva Función",
    "description": "Esta es una nueva función",
    "actions": {
      "save": "Guardar Cambios",
      "cancel": "Cancelar"
    }
  }
}
```

### 4. Validate Translations

Run the translation check to ensure all locales are in sync:

```bash
npm run check-translations
```

## Message Format Features

### Pluralization

Use ICU message format for plurals:

```json
{
  "itemCount": "{count, plural, =0 {No items} =1 {One item} other {# items}}"
}
```

```tsx
const t = useTranslations();
// Usage: t('itemCount', { count: 5 }) → "5 items"
```

### Variable Interpolation

Include variables in messages:

```json
{
  "welcome": "Welcome back, {name}!",
  "progress": "Step {current} of {total}"
}
```

```tsx
const t = useTranslations();
// Usage: t('welcome', { name: 'John' }) → "Welcome back, John!"
```

### Rich Text and Markup

For simple formatting, use the `t.rich()` function:

```json
{
  "agreement": "I agree to the <terms>Terms of Service</terms>"
}
```

```tsx
const t = useTranslations();

return t.rich('agreement', {
  terms: (chunks) => <Link href="/terms">{chunks}</Link>
});
```

## Formatting Utilities

Use the provided formatters for consistent localized formatting:

```tsx
import { useFormatters } from '@/lib/formatters';

function MyComponent() {
  const { formatDate, formatNumber, formatRelativeTime } = useFormatters();
  
  return (
    <div>
      <p>Amount: {formatNumber(1234.56)}</p>
      <p>Date: {formatDate(new Date())}</p>
      <p>Updated: {formatRelativeTime(lastUpdate)}</p>
    </div>
  );
}
```

## Error Handling

Use the error message utilities for consistent error translation:

```tsx
import { useErrorMessages } from '@/lib/error-messages';

function MyComponent() {
  const { translateError } = useErrorMessages();
  
  const handleError = (error: any) => {
    const message = translateError(error);
    setErrorMessage(message);
  };
}
```

## Adding a New Locale

### 1. Update Locale Configuration

Add the new locale to `src/i18n.ts`:

```tsx
export const locales = ['en', 'es', 'fr'] as const; // Add 'fr'
```

### 2. Create Message Catalogue

Create a new message file `messages/fr.json` with all keys translated:

```json
{
  "navigation": {
    "home": "Accueil",
    "composer": "Compositeur",
    // ... all other keys
  }
}
```

### 3. Update Language Switcher

Add the locale name to the language switcher:

```tsx
// In components/language-switcher.tsx
const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français', // Add this
};
```

### 4. Update Middleware

The middleware will automatically handle the new locale based on the `locales` array.

### 5. Test the New Locale

1. Run the translation check: `npm run check-translations`
2. Test navigation to `/fr/` routes
3. Verify the language switcher works
4. Check formatting functions work correctly

## Best Practices

### Naming Conventions

- Use clear, descriptive key names
- Group related keys under common namespaces
- Use camelCase for key names
- Avoid abbreviations when possible

```json
{
  "composer": {
    "operationTypes": {
      "payment": "Payment",
      "createAccount": "Create Account"  // Not "createAcct"
    }
  }
}
```

### Context and Clarity

- Provide enough context in key names
- Include comments in JSON when meaning might be ambiguous
- Consider character limits for UI elements

```json
{
  // Button text - keep short
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  },
  // Error messages - can be longer
  "errors": {
    "invalidStellarAddress": "The provided Stellar address format is invalid"
  }
}
```

### Performance Considerations

- Group related messages under namespaces to enable selective loading
- Keep message files manageable in size
- Use lazy loading for large feature-specific translations

### Accessibility

- Provide clear, descriptive text for screen readers
- Avoid relying on visual context alone
- Include proper ARIA labels in translations

```json
{
  "accessibility": {
    "openMenu": "Open navigation menu",
    "closeDialog": "Close dialog window"
  }
}
```

## Testing

### Unit Tests

Test components with different locales:

```tsx
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const renderWithLocale = (component, locale = 'en', messages = {}) => {
  return render(
    <NextIntlClientProvider messages={messages} locale={locale}>
      {component}
    </NextIntlClientProvider>
  );
};

test('renders in Spanish', () => {
  const messages = { title: 'Título' };
  renderWithLocale(<MyComponent />, 'es', messages);
  expect(screen.getByText('Título')).toBeInTheDocument();
});
```

### Integration Tests

- Test locale switching preserves application state
- Verify URL routing works correctly
- Check that formatting functions adapt to locale
- Ensure error messages are translated

## Troubleshooting

### Common Issues

**Missing translation keys**: Run `npm run check-translations` to identify missing keys.

**Locale routing not working**: Check that the locale is added to `src/i18n.ts` and middleware configuration.

**Formatting issues**: Ensure you're using the `useFormatters` hook instead of hardcoded formatting.

**Pluralization not working**: Verify ICU message format syntax and that all plural forms are included.

### Debugging

Enable debug mode in development:

```tsx
// In src/i18n.ts
export default getRequestConfig(async ({ locale }) => {
  return {
    messages: (await import(`../messages/${locale}.json`)).default,
    // Add this for debugging
    onError: (error) => console.warn('i18n error:', error),
  };
});
```

## Resources

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [ICU Message Format Guide](https://formatjs.io/docs/core-concepts/icu-syntax/)
- [Unicode CLDR Locale Data](https://cldr.unicode.org/)
- [Stellar Terminology](https://developers.stellar.org/docs/glossary)