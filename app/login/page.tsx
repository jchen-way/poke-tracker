import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Gamepad2 } from 'lucide-react';
import { getCurrentUser } from '../../lib/auth';
import { loginAction } from './actions';

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
          <h1 className="pixel-text">Welcome Back</h1>
          <p className="text-muted">Save your progress in the market.</p>
        </div>
        
        <form className="auth-form" action={loginAction}>
          <div className="form-group">
            <label className="pixel-text" htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" className="retro-input" placeholder="you@example.com" required />
          </div>
          
          <div className="form-group">
            <label className="pixel-text" htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" className="retro-input" placeholder="••••••••" required />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="btn-retro blue auth-submit">
            Sign In
          </button>

          <a href="/api/auth/google/start" className="btn-retro clear auth-submit auth-google">
            Continue with Google
          </a>

          <div className="auth-footer text-muted text-center">
            Don&apos;t have an account? <Link href="/register" className="auth-link">Create one</Link>
          </div>
        </form>
      </div>

      <style>{`
        .auth-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 80px); /* minus navbar */
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

        .auth-google {
          display: inline-flex;
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
