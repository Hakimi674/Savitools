'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyEmail } = useAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'expired' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token in URL.');
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/'), 2000);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('TOKEN_EXPIRED') || message.includes('Gone')) {
          setStatus('expired');
        } else {
          setStatus('error');
          setErrorMessage(message);
        }
      });
  }, [searchParams, verifyEmail, router]);

  if (status === 'verifying') {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <p className="text-sm text-muted-foreground">Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <h1 className="text-xl font-semibold mb-2">Email verified</h1>
        <p className="text-sm text-muted-foreground">
          Your email has been verified. Redirecting you to the dashboard…
        </p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <h1 className="text-xl font-semibold mb-2">Link expired</h1>
        <p className="text-sm text-muted-foreground mb-4">
          This verification link has expired (links are valid for 24 hours). Please register
          again to receive a new link.
        </p>
        <Link href="/register" className="text-sm text-foreground hover:underline">
          Back to register
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-xl font-semibold mb-2">Verification failed</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {errorMessage ?? 'Something went wrong. The link may be invalid.'}
      </p>
      <Link href="/register" className="text-sm text-foreground hover:underline">
        Back to register
      </Link>
    </div>
  );
}
