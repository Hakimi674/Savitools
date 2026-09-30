import createMiddleware from 'next-intl/middleware';
import { locales } from './i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale: 'en',

  // Prefix all paths with the locale
  localePrefix: 'as-needed'
});

export const config = {
  // Match only internationalized pathnames
  // Skip API routes, static files, and internal Next.js routes
  matcher: [
    '/',
    '/(es|en)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};