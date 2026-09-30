import { QuickstartWidget } from '@/components/onboarding/quickstart-widget';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AuthProvider } from '@/lib/auth-context';
import { NetworkProvider } from '@/lib/network-context';
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

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const messages = await getMessages();
  const metadata = messages.metadata as any;
  
  return {
    title: metadata?.title || 'SaviTools — Stellar Developer Workstation',
    description: metadata?.description || 'Professional developer infrastructure for the Stellar ecosystem. Transaction inspection, wallet tooling, webhooks, and more.',
  };
}

export default async function RootLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Providing all messages to the client side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <NetworkProvider>
              <CommandPaletteProvider>
                <SiteHeader />
                {children}
                <CommandPaletteDialog />
              </CommandPaletteProvider>
            </NetworkProvider>
          </AuthProvider>
          <QuickstartWidget />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

