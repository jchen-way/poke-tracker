import type { Metadata } from 'next';
import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';
import { getCurrentUserStrict } from '../../lib/auth';
import { registerAction } from '../login/actions';
import { redirect } from 'next/navigation';
import styles from '../components/auth-page.module.css';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create a PokeTracker account to save your Pokemon TCG watchlist, alerts, and collection activity.',
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = {
  error?: string;
};

const errorMessages: Record<string, string> = {
  missing: 'Fill in every field.',
  password: 'Password must be at least 8 characters.',
  match: 'Passwords do not match.',
  exists: 'That email is already registered.',
};

export default async function RegisterPage({
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
          <h1 className="pixel-text">Create Account</h1>
          <p className="text-muted">Create an account to save your watchlist, alerts, and collection activity.</p>
        </div>

        <form className={styles.form} action={registerAction}>
          <div className={styles.formGroup}>
            <label className={`pixel-text ${styles.label}`} htmlFor="register-email">Email</label>
            <input id="register-email" name="email" type="email" className={styles.input} placeholder="you@example.com" required />
          </div>

          <div className={styles.formGroup}>
            <label className={`pixel-text ${styles.label}`} htmlFor="register-password">Password</label>
            <input id="register-password" name="password" type="password" className={styles.input} placeholder="At least 8 characters" required minLength={8} />
          </div>

          <div className={styles.formGroup}>
            <label className={`pixel-text ${styles.label}`} htmlFor="register-confirm-password">Confirm Password</label>
            <input id="register-confirm-password" name="confirmPassword" type="password" className={styles.input} placeholder="Repeat your password" required minLength={8} />
          </div>

          {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}

          <button type="submit" className={`btn-retro blue ${styles.submitFull}`}>
            Register
          </button>

          <a href="/api/auth/google/start" className={`btn-retro clear ${styles.submitFull} ${styles.googleButton}`}>
            Continue with Google
          </a>

          <div className={`${styles.footer} ${styles.center} text-muted`}>
            Already have an account? <Link href="/login" className={styles.link}>Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
