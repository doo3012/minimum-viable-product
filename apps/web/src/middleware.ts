import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/onboard', '/change-password'];

export function middleware(req: NextRequest) {
  const token = req.cookies.get('auth_token');
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (token && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
