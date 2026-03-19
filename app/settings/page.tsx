import Link from 'next/link';
import { requireUser } from '../../lib/auth';
import { updatePasswordAction, updateProfileAction } from './actions';
import styles from '../components/auth-page.module.css';

type SearchParams = {
  saved?: string;
  error?: string;
};

const errorMessages: Record<string, string> = {
  password: 'New password must be at least 8 characters.',
  match: 'New password and confirmation do not match.',
  'current-password': 'Current password is incorrect.',
};

const successMessages: Record<string, string> = {
  profile: 'Account settings updated.',
  password: 'Password updated.',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams.error ? errorMessages[resolvedSearchParams.error] : null;
  const saved = resolvedSearchParams.saved ? successMessages[resolvedSearchParams.saved] : null;

  return (
    <div className={`${styles.page} ${styles.settingsPage} fade-in`}>
      <div className={styles.settingsShell}>
        <section className={`${styles.cardWide} retro-panel`}>
          <div className="auth-header">
            <h1 className="pixel-text">Account Settings</h1>
            <p className="text-muted">Manage your profile, password, and email signal preference.</p>
          </div>

          {saved ? <p className={`${styles.message} ${styles.success}`}>{saved}</p> : null}
          {error ? <p className={`${styles.message} ${styles.error}`}>{error}</p> : null}

          <form className={`${styles.form} ${styles.formCompact}`} action={updateProfileAction}>
            <div className={styles.formGroup}>
              <label className={`pixel-text ${styles.label}`} htmlFor="settings-email">Email</label>
              <input id="settings-email" type="email" className={styles.input} value={user.email} disabled />
            </div>
            <div className={styles.formGroup}>
              <label className={`pixel-text ${styles.label}`} htmlFor="settings-display-name">Display Name</label>
              <input
                id="settings-display-name"
                name="displayName"
                type="text"
                className={styles.input}
                defaultValue={user.displayName ?? ''}
                placeholder="How your name appears in the app"
              />
            </div>
            <label className={styles.checkbox}>
              <input
                name="emailNotificationsEnabled"
                type="checkbox"
                defaultChecked={user.emailNotificationsEnabled}
              />
              <span>Receive email notifications when new signals are found</span>
            </label>
            <button type="submit" className={`btn-retro blue ${styles.submitFit}`}>
              Save Profile
            </button>
          </form>
        </section>

        <section className={`${styles.cardWide} retro-panel`}>
          <div className="auth-header">
            <h2 className="pixel-text">Security</h2>
            <p className="text-muted">
              {user.authProvider === 'google'
                ? 'Set a password so you can also log in without Google.'
                : 'Update your password.'}
            </p>
          </div>

          <form className={`${styles.form} ${styles.formCompact}`} action={updatePasswordAction}>
            <div className={styles.formGroup}>
              <label className={`pixel-text ${styles.label}`} htmlFor="settings-current-password">Current Password</label>
              <input
                id="settings-current-password"
                name="currentPassword"
                type="password"
                className={styles.input}
                placeholder={user.authProvider === 'google' ? 'Leave blank if none set yet' : 'Enter current password'}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={`pixel-text ${styles.label}`} htmlFor="settings-new-password">New Password</label>
              <input
                id="settings-new-password"
                name="newPassword"
                type="password"
                className={styles.input}
                minLength={8}
                required
                placeholder="At least 8 characters"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={`pixel-text ${styles.label}`} htmlFor="settings-confirm-password">Confirm New Password</label>
              <input
                id="settings-confirm-password"
                name="confirmPassword"
                type="password"
                className={styles.input}
                minLength={8}
                required
                placeholder="Repeat your new password"
              />
            </div>
            <button type="submit" className={`btn-retro blue ${styles.submitFit}`}>
              Update Password
            </button>
          </form>

          <div className={`${styles.footnote} text-muted`}>
            Google sign-in is enabled. You can keep using both Google and email/password after setting a password here.
          </div>
        </section>

        <div className={styles.backRow}>
          <Link href="/dashboard" className="btn-retro clear">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
