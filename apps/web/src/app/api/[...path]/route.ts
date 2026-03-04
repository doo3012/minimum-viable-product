import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE = process.env.API_URL ?? 'http://api:5000';

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join('/');
  const url = `${API_BASE}/api/${path}${req.nextUrl.search}`;

  const token = req.cookies.get('auth_token')?.value;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const body = ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await req.text();

    const response = await axios({
      method: req.method,
      url,
      headers,
      data: body,
      validateStatus: () => true,
    });

    const res = response.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(response.data, { status: response.status });

    // Forward Set-Cookie headers (for login)
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      cookies.forEach((c) => res.headers.append('Set-Cookie', c));
    }

    return res;
  } catch (err: any) {
    console.error('PROXY ERROR:', err);
    return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
  }
}

export const GET = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
  params.then((p) => proxy(req, p));
export const POST = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
  params.then((p) => proxy(req, p));
export const PUT = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
  params.then((p) => proxy(req, p));
export const DELETE = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
  params.then((p) => proxy(req, p));
