import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { WebSocketProvider } from '../../../../../frontend/context/WebSocketContext';
import { AuthProvider } from '../../../../../frontend/context/AuthContext';
import KPIDashboard from '../../../../../frontend/components/kpi/KPIDashboard';
import { createTheme } from '../../../../../frontend/styles/theme';

// Mock WebSocket context
jest.mock('../../../../../frontend/context/WebSocketContext', () => ({
  WebSocketProvider: ({ children }) => children,
  useWebSocket: () => ({
    socket: {
      on: jest.fn(),
      emit: jest.fn(),
      off: jest.fn()
    },
    connected: true,
    sendMessage: jest.fn(),
    reconnectAttempts: 0
  })
}));

// Mock Auth context
jest.mock('../../../../../frontend/context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: {
      id: 'test-user',
      role: 'premium',
      name: 'Test User'
    },
    loading: false,
    isAuthenticated: true,
    hasRole: (role) => role === 'premium'
  })
}));

describe('KPIDashboard Component', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    off: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    const theme = createTheme('light');
    
    return render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <WebSocketProvider>
            <AuthProvider>
              <KPIDashboard />
            </AuthProvider>
          </WebSocketProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  };

  describe('Initial Rendering', () => {
    test('should render dashboard title and layout', () => {
      renderComponent();
      
      expect(screen.getByText('System Performance Dashboard')).toBeInTheDocument();
      
      // Check for KPI cards
      expect(screen.getByText('System Health')).toBeInTheDocument();
      expect(screen.getByText('Proposals Generated')).toBeInTheDocument();
      expect(screen.getByText('Success Rate')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('System Latency')).toBeInTheDocument();
      
      // Check for service health details section
      expect(screen.getByText('Service Health Details')).toBeInTheDocument();
    });

    test('should display initial loading state', () => {
      renderComponent();
      
      // Initially shows checking state
      const healthStatus = screen.getByText('CHECKING');
      expect(healthStatus).toBeInTheDocument();
      expect(healthStatus).toHaveStyle({ color: '#3b82f6' }); // info color
    });
  });

  describe('KPI Data Display', () => {
    test('should update KPIs when socket receives data', async () => {
      renderComponent();
      
      // Mock socket data
      const mockKPIs = {
        proposalsGenerated: 150,
        successRate: 97.5,
        systemLatency: 125,
        activeUsers: 42,
        systemHealth: 'optimal'
      };
      
      // Find the WebSocket context mock and trigger the event
      const socketEmit = mockSocket.emit;
      socketEmit.mock.calls.find(([event, data]) => {
        if (event === 'request_kpis') {
          // Simulate receiving KPI data
          mockSocket.on.mock.calls.find(([event, handler]) => {
            if (event === 'kpi_update') {
              handler(mockKPIs);
              return true;
            }
            return false;
          });
          return true;
        }
        return false;
      });
      
      // Wait for updates
      await waitFor(() => {
        expect(screen.getByText('150')).toBeInTheDocument();
        expect(screen.getByText('97.5%')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
        expect(screen.getByText('125ms')).toBeInTheDocument();
        
        // Health status should update
        const healthStatus = screen.getByText('OPTIMAL');
        expect(healthStatus).toBeInTheDocument();
        expect(healthStatus).toHaveStyle({ color: '#10b981' }); // success color
      });
    });

    test('should handle degraded system health status', async () => {
      renderComponent();
      
      const mockKPIs = {
        systemHealth: 'degraded',
        systemLatency: 2500
      };
      
      // Simulate KPI update
      mockSocket.on.mock.calls.find(([event, handler]) => {
        if (event === 'kpi_update') {
          handler(mockKPIs);
          return true;
        }
        return false;
      });
      
      await waitFor(() => {
        const healthStatus = screen.getByText('DEGRADED');
        expect(healthStatus).toBeInTheDocument();
        expect(healthStatus).toHaveStyle({ color: '#f59e0b' }); // warning color
        
        // Latency should show warning color
        const latency = screen.getByText('2500ms');
        expect(latency).toHaveStyle({ color: '#f59e0b' });
      });
    });

    test('should handle critical system health status', async () => {
      renderComponent();
      
      const mockKPIs = {
        systemHealth: 'critical',
        systemLatency: 6000
      };
      
      // Simulate KPI update
      mockSocket.on.mock.calls.find(([event, handler]) => {
        if (event === 'kpi_update') {
          handler(mockKPIs);
          return true;
        }
        return false;
      });
      
      await waitFor(() => {
        const healthStatus = screen.getByText('CRITICAL');
        expect(healthStatus).toBeInTheDocument();
        expect(healthStatus).toHaveStyle({ color: '#ef4444' }); // error color
        
        // Latency should show error color
        const latency = screen.getByText('6000ms');
        expect(latency).toHaveStyle({ color: '#ef4444' });
      });
    });
  });

  describe('Service Health Details', () => {
    test('should toggle service health details on click', async () => {
      renderComponent();
      
      const toggleButton = screen.getByText('Service Health Details');
      expect(toggleButton).toBeInTheDocument();
      
      // Initially collapsed
      expect(screen.queryByText('Database')).not.toBeInTheDocument();
      
      // Click to expand
      fireEvent.click(toggleButton);
      
      // Should show service details
      await waitFor(() => {
        expect(screen.getByText('Database')).toBeInTheDocument();
        expect(screen.getByText('AI Engine')).toBeInTheDocument();
        expect(screen.getByText('Vector Store')).toBeInTheDocument();
        expect(screen.getByText('Job Queue')).toBeInTheDocument();
        expect(screen.getByText('Email Service')).toBeInTheDocument();
      });
      
      // Click again to collapse
      fireEvent.click(toggleButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Database')).not.toBeInTheDocument();
      });
    });

    test('should display correct service status colors', async () => {
      renderComponent();
      
      // Expand details first
      fireEvent.click(screen.getByText('Service Health Details'));
      
      // Simulate KPI update with service statuses
      const mockKPIs = {
        services: {
          database: { status: 'optimal' },
          ai: { status: 'degraded' },
          vectorStore: { status: 'optimal' },
          queue: { status: 'optimal' },
          email: { status: 'critical' }
        }
      };
      
      mockSocket.on.mock.calls.find(([event, handler]) => {
        if (event === 'kpi_update') {
          handler(mockKPIs);
          return true;
        }
        return false;
      });
      
      await waitFor(() => {
        // Database - optimal (green)
        const dbStatus = screen.getByText('Database').closest('div');
        expect(dbStatus).toHaveStyle({ borderColor: '#10b981' });
        
        // AI Engine - degraded (yellow)
        const aiStatus = screen.getByText('AI Engine').closest('div');
        expect(aiStatus).toHaveStyle({ borderColor: '#f59e0b' });
        
        // Email Service - critical (red)
        const emailStatus = screen.getByText('Email Service').closest('div');
        expect(emailStatus).toHaveStyle({ borderColor: '#ef4444' });
      });
    });
  });

  describe('Trend Indicators', () => {
    test('should display positive trend indicators correctly', async () => {
      renderComponent();
      
      const mockKPIs = {
        proposalsGenerated: 150,
        successRate: 97.5,
        systemLatency: 125,
        activeUsers: 42,
        trends: {
          proposalsGenerated: 4.2, // positive is good
          successRate: 2.1, // positive is good
          systemLatency: -15, // negative is good for latency
          activeUsers: 2.1 // positive is good
        }
      };
      
      mockSocket.on.mock.calls.find(([event, handler]) => {
        if (event === 'kpi_update') {
          handler(mockKPIs);
          return true;
        }
        return false;
      });
      
      await waitFor(() => {
        // Proposals generated trend
        expect(screen.getByText('+4.2%')).toBeInTheDocument();
        expect(screen.getByText('+4.2%')).toHaveStyle({ color: '#10b981' }); // success color
        
        // Success rate trend
        expect(screen.getByText('+2.1%')).toBeInTheDocument();
        expect(screen.getByText('+2.1%')).toHaveStyle({ color: '#10b981' });
        
        // Latency trend (negative is good)
        expect(screen.getByText('-15.0%')).toBeInTheDocument();
        expect(screen.getByText('-15.0%')).toHaveStyle({ color: '#10b981' });
        
        // Active users trend
        expect(screen.getByText('+2.1%')).toBeInTheDocument();
        expect(screen.getByText('+2.1%')).toHaveStyle({ color: '#10b981' });
      });
    });

    test('should display negative trend indicators correctly', async () => {
      renderComponent();
      
      const mockKPIs = {
        successRate: 92.5,
        trends: {
          successRate: -3.5, // negative is bad
          systemLatency: 25 // positive is bad for latency
        }
      };
      
      mockSocket.on.mock.calls.find(([event, handler]) => {
        if (event === 'kpi_update') {
          handler(mockKPIs);
          return true;
        }
        return false;
      });
      
      await waitFor(() => {
        // Success rate trend (negative is bad)
        expect(screen.getByText('-3.5%')).toBeInTheDocument();
        expect(screen.getByText('-3.5%')).toHaveStyle({ color: '#ef4444' }); // error color
        
        // Latency trend (positive is bad)
        const latencyElement = screen.getByText('ms');
        expect(latencyElement).toHaveStyle({ color: '#ef4444' });
      });
    });
  });

  describe('Accessibility', () => {
    test('should be accessible with proper ARIA attributes', () => {
      renderComponent();
      
      // Dashboard should have proper role
      const dashboard = screen.getByRole('region', { name: /system performance dashboard/i });
      expect(dashboard).toBeInTheDocument();
      
      // KPI cards should have proper roles
      const kpiCards = screen.getAllByRole('article');
      expect(kpiCards.length).toBeGreaterThan(0);
      
      // Health status should have aria-live for dynamic updates
      const healthStatus = screen.getByText('CHECKING');
      expect(healthStatus.closest('div')).toHaveAttribute('aria-live', 'polite');
    });

    test('should support keyboard navigation', () => {
      renderComponent();
      
      // Service health details toggle should be focusable
      const toggleButton = screen.getByText('Service Health Details');
      expect(toggleButton).toHaveAttribute('tabIndex', '0');
      
      // Simulate keyboard interaction
      fireEvent.keyDown(toggleButton, { key: 'Enter', code: 'Enter' });
      
      // Should expand details
      expect(screen.getByText('Database')).toBeInTheDocument();
    });
  });
});