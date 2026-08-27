/**
 * WebSocket Store
 * Manages WebSocket connections for real-time updates
 */

import { create } from 'zustand';
import type { WebSocketMessage } from '@/types/api';

interface WebSocketState {
  isConnected: boolean;
  connection: WebSocket | null;
  subscriptions: Set<string>;
  connect: (url: string, token: string) => void;
  disconnect: () => void;
  subscribe: (topic: string) => void;
  unsubscribe: (topic: string) => void;
  send: (message: WebSocketMessage) => void;
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  isConnected: false,
  connection: null,
  subscriptions: new Set(),

  connect: (url: string, token: string) => {
    const ws = new WebSocket(`${url}?token=${token}`);

    ws.onopen = () => {
      set({ isConnected: true, connection: ws });
    };

    ws.onclose = () => {
      set({ isConnected: false, connection: null });
      // Auto reconnect after 5 seconds
      setTimeout(() => {
        get().connect(url, token);
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        // Dispatch custom event for components to listen
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('websocket-message', { detail: message }));
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  },

  disconnect: () => {
    const { connection } = get();
    if (connection) {
      connection.close();
      set({ isConnected: false, connection: null });
    }
  },

  subscribe: (topic: string) => {
    const { subscriptions, connection } = get();
    subscriptions.add(topic);
    set({ subscriptions });

    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(
        JSON.stringify({
          type: 'subscribe',
          topic,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  },

  unsubscribe: (topic: string) => {
    const { subscriptions, connection } = get();
    subscriptions.delete(topic);
    set({ subscriptions });

    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(
        JSON.stringify({
          type: 'unsubscribe',
          topic,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  },

  send: (message: WebSocketMessage) => {
    const { connection } = get();
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    }
  },
}));
