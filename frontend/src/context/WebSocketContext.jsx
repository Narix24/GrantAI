// frontend/src/context/WebSocketContext.jsx
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useThemeContext } from './ThemeContext';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { token } = useAuth();
  const { mode } = useThemeContext();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnectTimeoutRef = useRef(null);
  const messageQueueRef = useRef([]);

  useEffect(() => {
    if (!token) return;
    
    const connect = () => {
      // Clean up previous socket
      if (socket) {
        socket.close();
      }
      
      // Create new WebSocket connection
      const wsUrl = process.env.VITE_WS_URL || 
                   (process.env.NODE_ENV === 'development' 
                    ? 'ws://localhost:3001' 
                    : `wss://${window.location.host}`);
      
      const ws = new WebSocket(`${wsUrl}/websocket?token=${encodeURIComponent(token)}&theme=${mode}`);
      
      // Connection handlers
      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setSocket(ws);
        setReconnectAttempts(0);
        
        // Send queued messages
        messageQueueRef.current.forEach(message => {
          ws.send(JSON.stringify(message));
        });
        messageQueueRef.current = [];
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleIncomingMessage(data);
        } catch (error) {
          console.error('WebSocket message parsing failed:', error);
        }
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.reason);
        setConnected(false);
        setSocket(null);
        
        // Attempt reconnection with exponential backoff
        if (reconnectAttempts < 10) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, delay);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };
    
    connect();
    
    return () => {
      // Cleanup
      if (socket) {
        socket.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [token, mode]);

  const handleIncomingMessage = (data) => {
    switch (data.type) {
      case 'kpi_update':
        // Update KPIs in state management
        break;
      case 'health_update':
        // Update health status
        break;
      case 'chaos_update':
        // Update chaos status
        break;
      case 'metrics_update':
        // Update metrics
        break;
      case 'notification':
        // Show notification
        showNotification(data.payload);
        break;
      default:
        console.log('Unhandled WebSocket message:', data);
    }
  };

  const showNotification = (notification) => {
    // Check if browser supports notifications
    if (!('Notification' in window)) return;
    
    // Request permission if needed
    if (Notification.permission !== 'granted') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          createNotification(notification);
        }
      });
      return;
    }
    
    createNotification(notification);
  };

  const createNotification = (notification) => {
    const notif = new Notification(notification.title, {
      body: notification.message,
      icon: '/logo.png',
      tag: notification.tag || 'grant-ai-notification'
    });
    
    notif.onclick = () => {
      window.focus();
      if (notification.url) {
        window.location.href = notification.url;
      }
    };
    
    // Auto-close after 5 seconds
    setTimeout(() => {
      notif.close();
    }, 5000);
  };

  const sendMessage = (type, payload) => {
    const message = { type, payload, timestamp: Date.now() };
    
    if (socket && connected) {
      socket.send(JSON.stringify(message));
      return true;
    }
    
    // Queue message for when connection is established
    messageQueueRef.current.push(message);
    return false;
  };

  const value = {
    socket,
    connected,
    sendMessage,
    reconnectAttempts
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export { WebSocketContext };