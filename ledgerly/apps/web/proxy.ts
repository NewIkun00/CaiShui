import { NextRequest, NextResponse } from 'next/server';

const publicPaths = new Set(['/login', '/register', '/auth/callback']);

export function proxy(request: NextRequest) {
  if (process.env['NEXT_PUBLIC_AUTH_MODE'] !== 'oidc') return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const authenticated = request.cookies.has('ledgerly_session');
  if (publicPaths.has(pathname)) {
    return authenticated && pathname !== '/auth/callback'
      ? NextResponse.redirect(new URL('/dashboard', request.url))
      : NextResponse.next();
  }
  if (authenticated) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
