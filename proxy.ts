import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/dashboard', '/collections', '/etbs', '/watchlist', '/settings'];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = request.cookies.get('pokemon_tracker_session')?.value;
  if (session) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/collections/:path*', '/etbs/:path*', '/watchlist/:path*', '/settings/:path*'],
};
