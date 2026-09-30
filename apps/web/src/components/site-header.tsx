'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { CommandPaletteTrigger } from '@/components/command-palette';
import { Monitor, Moon, Sun } from 'lucide-react';

export function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const ThemeIcon = mode === 'system' ? Monitor : mode === 'dark' ? Moon : Sun;

  return (
    <div className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
            SaviTools
          </Link>
          <span className="hidden sm:inline text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
            Stellar Developer Workstation
          </span>
        </div>

        <div className="flex items-center gap-3">
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Docs
            </Link>
            <Link href="/api" className="hover:text-foreground transition-colors">
              API
            </Link>
          </nav>
          <CommandPaletteTrigger />
          <label className="inline-flex items-center gap-1.5 text-muted-foreground" title="Color theme">
            <ThemeIcon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Color theme</span>
            <select
              aria-label="Color theme"
              value={mode}
              onChange={(event) => setMode(event.target.value as 'light' | 'dark' | 'system')}
              className="bg-transparent text-xs focus:outline-none"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <div className="flex items-center gap-4 text-sm">
            <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
              Settings
            </Link>
            {loading ? (
              <span className="text-muted-foreground text-xs">Loading…</span>
            ) : user ? (
              <>
                <span className="text-muted-foreground hidden sm:inline">{user.email}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="border border-border rounded px-2.5 py-1 hover:border-foreground/30 transition-colors"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

