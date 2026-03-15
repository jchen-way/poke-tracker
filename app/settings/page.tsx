import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '../../lib/auth';
import { updatePasswordAction, updateProfileAction } from './actions';

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

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="auth-page fade-in">
      <div className="settings-shell">
        <section className="auth-card retro-panel">
          <div className="auth-header">
            <h1 className="pixel-text">Account Settings</h1>
            <p className="text-muted">Manage your profile, password, and email signal preference.</p>
          </div>

          {saved ? <p className="auth-success">{saved}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}

          <form className="auth-form" action={updateProfileAction}>
            <div className="form-group">
              <label className="pixel-text" htmlFor="settings-email">Email</label>
              <input id="settings-email" type="email" className="retro-input" value={user.email} disabled />
            </div>
            <div className="form-group">
              <label className="pixel-text" htmlFor="settings-display-name">Display Name</label>
              <input
                id="settings-display-name"
                name="displayName"
                type="text"
                className="retro-input"
                defaultValue={user.displayName ?? ''}
                placeholder="How your name appears in the app"
              />
            </div>
            <label className="settings-checkbox">
              <input
                name="emailNotificationsEnabled"
                type="checkbox"
                defaultChecked={user.emailNotificationsEnabled}
              />
              <span>Receive email notifications when new signals are found</span>
            </label>
            <button type="submit" className="btn-retro blue auth-submit">
              Save Profile
            </button>
          </form>
        </section>

        <section className="auth-card retro-panel">
          <div className="auth-header">
            <h2 className="pixel-text">Security</h2>
            <p className="text-muted">
              {user.authProvider === 'google'
                ? 'Set a password so you can also log in without Google.'
                : 'Update your password.'}
            </p>
          </div>

          <form className="auth-form" action={updatePasswordAction}>
            <div className="form-group">
              <label className="pixel-text" htmlFor="settings-current-password">Current Password</label>
              <input
                id="settings-current-password"
                name="currentPassword"
                type="password"
                className="retro-input"
                placeholder={user.authProvider === 'google' ? 'Leave blank if none set yet' : 'Enter current password'}
              />
            </div>
            <div className="form-group">
              <label className="pixel-text" htmlFor="settings-new-password">New Password</label>
              <input
                id="settings-new-password"
                name="newPassword"
                type="password"
                className="retro-input"
                minLength={8}
                required
                placeholder="At least 8 characters"
              />
            </div>
            <div className="form-group">
              <label className="pixel-text" htmlFor="settings-confirm-password">Confirm New Password</label>
              <input
                id="settings-confirm-password"
                name="confirmPassword"
                type="password"
                className="retro-input"
                minLength={8}
                required
                placeholder="Repeat your new password"
              />
            </div>
            <button type="submit" className="btn-retro blue auth-submit">
              Update Password
            </button>
          </form>

          <div className="settings-footnote text-muted">
            Google sign-in is enabled. You can keep using both Google and email/password after setting a password here.
          </div>
        </section>

        <div className="settings-back">
          <Link href="/dashboard" className="btn-retro clear">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <style>{`
        .auth-page {
          display: flex;
          justify-content: center;
          min-height: calc(100vh - 80px);
          padding: 2rem;
        }

        .settings-shell {
          width: 100%;
          max-width: 960px;
          display: grid;
          gap: 1.5rem;
        }

        .auth-card {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .retro-input {
          padding: 12px 16px;
          font-family: var(--font-main);
          font-size: 1rem;
          border: 2px solid var(--color-border-dark);
          border-radius: 6px;
          background: #fff;
          outline: none;
        }

        .retro-input:focus {
          border-color: var(--color-accent-blue);
          box-shadow: 2px 2px 0px var(--color-accent-blue);
        }

        .auth-error, .auth-success {
          margin: 0;
          padding: 0.75rem 0.9rem;
          border-radius: 10px;
          font-size: 0.95rem;
        }

        .auth-error {
          border: 1px solid rgba(249, 115, 115, 0.25);
          background: rgba(249, 115, 115, 0.1);
          color: var(--color-trend-down);
        }

        .auth-success {
          border: 1px solid rgba(74, 222, 128, 0.25);
          background: rgba(74, 222, 128, 0.12);
          color: #166534;
        }

        .auth-submit {
          width: fit-content;
        }

        .settings-checkbox {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.95rem;
        }

        .settings-footnote {
          font-size: 0.9rem;
        }

        .settings-back {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
}
