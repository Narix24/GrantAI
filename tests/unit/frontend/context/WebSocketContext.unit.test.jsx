import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);
export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }) => {
  const { token, user } = useAuth();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [kpiData, setKpiData] = useState(null);

  const reconnectTimer = useRef(null);
  const isUnmounted = useRef(false);
  const maxReconnectAttempts = 10;

  // ---- Notification Helper ----
  const showNotification = useCallback((payload) => {
    try {
      if (!payload?.title || Notification.permission === 'denied') return;

      const notification = new Notification(payload.title, {
        body: payload.message || '',
        icon: '/logo.png',
        tag: 'grant-ai-notification'
      });

      if (payload.url) {
        notification.onclick = () => {
          window.open(payload.url, '_blank');
        };
      }

      // Auto-close after 5s
      setTimeout(() => {
        notification.close?.();
      }, 5000);
    } catch (err) {
      console.error('Notification failed:', err);
    }
  }, []);

  // ---- Message Handler ----
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'notification':
          showNotification(data.payload);
          break;

        case 'response_kpis':
        case 'kpi_update':
          setKpiData(data.payload);
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('WebSocket message parsing failed:', err);
    }
  }, [showNotification]);

  // ---- Connection Setup ----
  const connectWebSocket = useCallback(() => {
    if (!token || isUnmounted.current) return;

    let ws;
    try {
      const url = `wss://example.com/ws?token=${token}&user=${user?.id}`;
      ws = new WebSocket(url);
      setSocket(ws);
    } catch (err) {
      console.error('WebSocket connection failed', err);
      setConnected(false);
      return;
    }

    ws.addEventListener('open', () => {
      if (isUnmounted.current) return;
      setConnected(true);
      setReconnectAttempts(0);

      // Automatically request KPI data on connect
      ws.send(
        JSON.stringify({
          type: 'request_kpis',
          timestamp: Date.now()
        })
      );
    });

    ws.addEventListener('message', handleMessage);

    ws.addEventListener('close', () => {
      setConnected(false);
      if (!isUnmounted.current) attemptReconnect();
    });

    ws.addEventListener('error', (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    });

    setSocket(ws);
  }, [token, user, handleMessage]);

  // ---- Reconnection ----
  const attemptReconnect = useCallback(() => {
    if (document.visibilityState === 'hidden') return;
    if (reconnectAttempts >= maxReconnectAttempts) return;
    if (isUnmounted.current) return;

    setReconnectAttempts((prev) => prev + 1);

    reconnectTimer.current = setTimeout(() => {
      connectWebSocket();
    }, 1000 * reconnectAttempts);
  }, [connectWebSocket, reconnectAttempts]);

  // ---- Send Message ----
  const sendMessage = useCallback(
    (type, payload) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type, ...payload }));
    },
    [socket]
  );

  // ---- Lifecycle ----
  useEffect(() => {
    connectWebSocket();

    return () => {
      isUnmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (socket) {
        socket.removeEventListener?.('message', handleMessage);
        socket.removeEventListener?.('open', () => {});
        socket.removeEventListener?.('close', () => {});
        socket.close?.();
      }
    };
  }, [connectWebSocket]);

  // ---- Visibility Change Listener ----
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !connected) {
        attemptReconnect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connected, attemptReconnect]);

  const value = useMemo(
    () => ({
      socket,
      connected,
      reconnectAttempts,
      sendMessage,
      kpiData
    }),
    [socket, connected, reconnectAttempts, sendMessage, kpiData]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
