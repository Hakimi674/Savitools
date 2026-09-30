'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

// ─── Password strength ────────────────────────────────────────────────────────

type StrengthLevel = 'empty' | 'weak' | 'fair' | 'strong';

interface StrengthResult {
  level: StrengthLevel;
  label: string;
  score: number; // 0–4
}

function measureStrength(password: string): StrengthResult {
  if (!password) return { level: 'empty', label: '', score: 0 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 'weak', label: 'Weak', score };
  if (score <= 3) return { level: 'fair', label: 'Fair', score };
  return { level: 'strong', label: 'Strong', score };
}

const strengthColors: Record<StrengthLevel, string> = {
  empty: 'bg-muted',
  weak: 'bg-destructive',
  fair: 'bg-yellow-500',
  strong: 'bg-green-500',
};

const strengthTextColors: Record<StrengthLevel, string> = {
  empty: 'text-muted-foreground',
  weak: 'text-destructive',
  fair: 'text-yellow-600',
  strong: 'text-green-600',
};

function PasswordStrengthMeter({ password }: { password: string }) {
  const { level, label, score } = measureStrength(password);
  if (!password) return null;

  return (
    <div className="space-y-1" aria-live="polite" aria-label={`Password strength: ${label}`}>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              score >= n ? strengthColors[level] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs ${strengthTextColors[level]}`}>{label}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      await register(email.trim(), password);
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <h1 className="text-xl font-semibold mb-2">Check your email</h1>
        <p className="text-sm text-muted-foreground mb-4">
          We sent a verification link to <strong>{email}</strong>. Click the link to activate
          your account. The link expires in 24 hours.
        </p>
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-xl font-semibold mb-2">Create account</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Register to persist your SaviTools workspace across sessions and devices.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-muted-foreground mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
