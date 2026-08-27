/**
 * useWebSocket Hook
 * Provides WebSocket connection management for real-time updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

interface UseWebSocketReturn {
  connected: boolean;
  data: WebSocketMessage | null;
  send: (message: unknown) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onMessage,
    onError,
    onOpen,
    onClose,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options;

  const { accessToken } = useAuthStore((state) => state.auth);
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<WebSocketMessage | null>(null);

  const connect = useCallback(() => {
    if (!accessToken) return;

    try {
      // Build WebSocket URL with authentication
      const wsUrl = url.includes('?')
        ? `${url}&token=${accessToken}`
        : `${url}?token=${accessToken}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setData(message);
          onMessage?.(message);

          // Auto-update React Query cache based on message type
          if (message.type === 'task-update' && message.taskId) {
            queryClient.invalidateQueries({
              queryKey: ['attack-tasks', message.taskId],
            });
          } else if (message.type === 'task-result' && message.taskId) {
            queryClient.setQueryData(['attack-tasks', message.taskId, 'results'], message.data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };

      ws.onclose = () => {
        setConnected(false);
        onClose?.();

        // Auto-reconnect if enabled
        if (autoReconnect && accessToken) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [
    url,
    accessToken,
    onMessage,
    onError,
    onOpen,
    onClose,
    autoReconnect,
    reconnectInterval,
    queryClient,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      connect();
    }, 1000);
  }, [disconnect, connect]);

  const send = useCallback(
    (message: unknown) => {
      if (wsRef.current && connected) {
        wsRef.current.send(JSON.stringify(message));
      } else {
        console.warn('WebSocket is not connected');
      }
    },
    [connected],
  );

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    data,
    send,
    disconnect,
    reconnect,
  };
}
