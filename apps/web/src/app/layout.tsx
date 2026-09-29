import { QuickstartWidget } from '@/components/onboarding/quickstart-widget';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { NetworkProvider } from '@/lib/network-context';
import { ThemeProvider } from '@/lib/theme-context';
import { SiteHeader } from '@/components/site-header';
import {
  CommandPaletteProvider,
  CommandPaletteDialog,
} from '@/components/command-palette';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SaviTools — Stellar Developer Workstation',
  description:
    'Professional developer infrastructure for the Stellar ecosystem. Transaction inspection, wallet tooling, webhooks, and more.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <ThemeProvider>
            <NetworkProvider>
              <CommandPaletteProvider>
                <SiteHeader />
                {children}
                <CommandPaletteDialog />
              </CommandPaletteProvider>
            </NetworkProvider>
          </ThemeProvider>
        </AuthProvider>
        <QuickstartWidget />
      </body>
    </html>
  );
}

