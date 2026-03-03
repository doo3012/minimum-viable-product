import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const CHAT_BASE = process.env.CHAT_URL || 'http://chat:8080';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const buId = req.nextUrl.searchParams.get('buId');
  if (!buId) return NextResponse.json({ error: 'buId required' }, { status: 400 });

  // First get a chat token from the .NET API
  const API_BASE = process.env.API_URL || 'http://api:5000';
  const tokenRes = await fetch(`${API_BASE}/api/chat-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ buId }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Failed to get chat token' }, { status: tokenRes.status });
  }

  const { token: chatToken } = await tokenRes.json();

  // Use the chat token to fetch history from Go service
  const res = await fetch(
    `${CHAT_BASE}/api/workspaces/by-bu/${buId}/messages?limit=50`
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: 200 });
}
