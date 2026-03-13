import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';
import { getCurrentUser } from '../../lib/auth';
import { registerAction } from '../login/actions';
import { redirect } from 'next/navigation';

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
  const user = await getCurrentUser();
  if (user) {
    redirect('/dashboard');
  }

  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams.error ? errorMessages[resolvedSearchParams.error] : null;

  return (
    <div className="auth-page fade-in">
      <div className="auth-card retro-panel">
        <div className="auth-header text-center">
          <Gamepad2 size={48} color="var(--color-accent-secondary)" style={{ margin: '0 auto 1rem auto' }} />
          <h1 className="pixel-text">Create Trainer ID</h1>
          <p className="text-muted">Create an account to save alerts and collection decisions.</p>
        </div>

        <form className="auth-form" action={registerAction}>
          <div className="form-group">
            <label className="pixel-text" htmlFor="register-email">Trainer ID (Email)</label>
            <input id="register-email" name="email" type="email" className="retro-input" placeholder="ash@pallet.town" required />
          </div>

          <div className="form-group">
            <label className="pixel-text" htmlFor="register-password">Password</label>
            <input id="register-password" name="password" type="password" className="retro-input" placeholder="At least 8 characters" required minLength={8} />
          </div>

          <div className="form-group">
            <label className="pixel-text" htmlFor="register-confirm-password">Confirm Password</label>
            <input id="register-confirm-password" name="confirmPassword" type="password" className="retro-input" placeholder="Repeat your password" required minLength={8} />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="btn-retro blue auth-submit">
            Register
          </button>

          <div className="auth-footer text-muted text-center">
            Already have an account? <Link href="/login" className="auth-link">Login</Link>
          </div>
        </form>
      </div>

      <style>{`
        .auth-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 80px);
          padding: 2rem;
        }

        .auth-card {
          width: 100%;
          max-width: 420px;
          padding: 3rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .text-center {
          text-align: center;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-size: 0.9rem;
          color: var(--color-text-main);
        }

        .retro-input {
          padding: 12px 16px;
          font-family: var(--font-main);
          font-size: 1rem;
          border: 2px solid var(--color-border-dark);
          border-radius: 6px;
          background: #fff;
          outline: none;
          box-shadow: inset 2px 2px 0px rgba(0,0,0,0.05);
          transition: all var(--transition-smooth);
        }

        .retro-input:focus {
          border-color: var(--color-accent-blue);
          box-shadow: 2px 2px 0px var(--color-accent-blue);
        }

        .auth-error {
          margin: 0;
          padding: 0.75rem 0.9rem;
          border: 1px solid rgba(249, 115, 115, 0.25);
          border-radius: 10px;
          background: rgba(249, 115, 115, 0.1);
          color: var(--color-trend-down);
          font-size: 0.95rem;
        }

        .auth-submit {
          width: 100%;
          justify-content: center;
        }

        .auth-footer {
          margin-top: 0.25rem;
          font-size: 0.9rem;
        }

        .auth-link {
          color: var(--color-accent-blue);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
