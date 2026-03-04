'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export function ChatBox({ buId }: { buId: string }) {
  const { userId } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket | undefined;
    let cancelled = false;

    const connect = async () => {
      // 1. Fetch history
      try {
        const historyRes = await api.get(`/chat/messages?buId=${buId}`);
        if (!cancelled) setMessages(historyRes.data ?? []);
      } catch {
        // History unavailable — not critical
      }

      // 2. Get chat token
      let chatToken: string;
      try {
        const tokenRes = await api.post('/chat/token', { buId });
        chatToken = tokenRes.data.token;
      } catch {
        if (!cancelled) setError('Chat service is unavailable.');
        return;
      }

      // 3. Connect WebSocket
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsHost =
          process.env.NEXT_PUBLIC_CHAT_WS_URL ||
          `${wsProtocol}://${window.location.hostname}:8080`;
        ws = new WebSocket(`${wsHost}/ws?token=${chatToken}&buId=${buId}`);
        wsRef.current = ws;

        ws.onopen = () => { if (!cancelled) setConnected(true); };
        ws.onclose = () => { if (!cancelled) setConnected(false); };
        ws.onerror = () => { if (!cancelled) setError('Chat service is unavailable.'); };
        ws.onmessage = (event) => {
          if (cancelled) return;
          const msg: ChatMessage = JSON.parse(event.data);
          setMessages((prev) => [...prev, msg]);
        };
      } catch {
        if (!cancelled) setError('Chat service is unavailable.');
      }
    };

    connect();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [buId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      return;
    wsRef.current.send(JSON.stringify({ content: input.trim() }));
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-lg border border-gray-200 items-center justify-center">
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Chat</h2>
        <span
          className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isMe = msg.userId === userId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <span className="text-xs text-gray-500 mb-1">{msg.displayName}</span>
              <div
                className={`px-3 py-2 rounded-lg max-w-md text-sm ${
                  isMe ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-xs text-gray-400 mt-0.5">
                {new Date(msg.createdAt).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={!connected || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
