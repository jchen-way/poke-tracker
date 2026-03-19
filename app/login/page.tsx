import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Gamepad2 } from 'lucide-react';
import { getCurrentUserStrict } from '../../lib/auth';
import { loginAction } from './actions';
import styles from '../components/auth-page.module.css';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to PokeTracker to access your Pokemon TCG dashboard, watchlist, and alerts.',
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = {
  error?: string;
};

const errorMessages: Record<string, string> = {
  missing: 'Enter your email and password.',
  invalid: 'Invalid email or password.',
  google: 'This account uses Google sign-in. Use Google or set a password in account settings.',
  'google-auth': 'Google sign-in failed. Try again.',
  'google-config': 'Google sign-in is not configured yet.',
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUserStrict();
  if (user) {
    redirect('/dashboard');
  }

  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams.error ? errorMessages[resolvedSearchParams.error] : null;

  return (
    <div className={`${styles.page} fade-in`}>
      <div className={`${styles.cardCompact} retro-panel`}>
        <div className={`${styles.center} auth-header`}>
          <Gamepad2 size={48} color="var(--color-accent-secondary)" style={{ margin: '0 auto 1rem auto' }} />
          <h1 className="pixel-text">Welcome Back</h1>
          <p className="text-muted">Save your progress in the market.</p>
        </div>

        <form className={styles.form} action={loginAction}>
          <div className={styles.formGroup}>
            <label className={`pixel-text ${styles.label}`} htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" className={styles.input} placeholder="you@example.com" required />
          </div>

          <div className={styles.formGroup}>
            <label className={`pixel-text ${styles.label}`} htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" className={styles.input} placeholder="••••••••" required />
          </div>

          {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}

          <button type="submit" className={`btn-retro blue ${styles.submitFull}`}>
            Sign In
          </button>

          <a href="/api/auth/google/start" className={`btn-retro clear ${styles.submitFull} ${styles.googleButton}`}>
            Continue with Google
          </a>

          <div className={`${styles.footer} ${styles.center} text-muted`}>
            Don&apos;t have an account? <Link href="/register" className={styles.link}>Create one</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
