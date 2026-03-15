import Link from 'next/link';
import { Gamepad2, UserCircle } from 'lucide-react';
import { getCurrentUser } from '../../lib/auth';
import { logoutAction } from '../login/actions';

export default async function Navbar() {
  const user = await getCurrentUser();

  return (
    <nav className="navbar fade-in">
      <Link href="/" className="nav-brand">
        <Gamepad2 size={28} color="var(--color-accent-secondary)" />
        <span>PokéTracker</span>
      </Link>
      
      <div className="nav-links">
        <Link href="/dashboard" className="nav-link">Tracker</Link>
        <Link href="/collections" className="nav-link">Collections</Link>
        <Link href="/etbs" className="nav-link">ETBs</Link>
        {user ? <Link href="/watchlist" className="nav-link">Watchlist</Link> : null}

        {user ? (
          <div className="nav-auth">
            <span className="nav-user">{user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="btn-retro">
                <UserCircle size={18} />
                Logout
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="btn-retro">
            <UserCircle size={18} />
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
