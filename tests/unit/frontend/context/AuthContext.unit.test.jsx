// GRANT-AI/tests/frontend/context/AuthContext.unit.test.js
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../../../../frontend/context/AuthContext';
import api from '../../../../../frontend/utils/api';

// Mock API module
jest.mock('../../../../../frontend/utils/api', () => ({
  default: {
    post: jest.fn(),
    get: jest.fn()
  }
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Test component that uses AuthContext
const TestComponent = () => {
  const { user, loading, login, logout, error } = useAuth();

  return (
    <div>
      {loading && <div data-testid="loading">Loading...</div>}
      {error && <div>{error}</div>}
      {user && (
        <div data-testid="user-info">
          <div data-testid="user-email">{user.email}</div>
          <div data-testid="user-name">{user.name}</div>
          <div data-testid="user-role">{user.role}</div>
        </div>
      )}
      <button onClick={() => login({ email: 'test@example.com', password: 'password123' })}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful API responses
    api.post.mockImplementation((url) => {
      if (url === '/api/auth/login') {
        return Promise.resolve({
          data: {
            token: 'test_jwt_token',
            user: {
              id: 'user_123',
              email: 'test@example.com',
              name: 'Test User',
              role: 'user'
            }
          }
        });
      }
      if (url === '/api/auth/logout') {
        return Promise.resolve({ data: { success: true } });
      }
      if (url === '/api/auth/refresh') {
        return Promise.resolve({ data: { token: 'new_token' } });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    api.get.mockImplementation((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          data: {
            user: {
              id: 'user_123',
              email: 'test@example.com',
              name: 'Test User',
              role: 'user'
            }
          }
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockLocalStorage.removeItem.mockReset();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>
    );
  };

  describe('Initial State', () => {
    test('should show loading state initially', () => {
      renderComponent();
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    test('should check authentication on mount', async () => {
      renderComponent();
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/auth/me');
      });
    });

    test('should clear invalid tokens on authentication failure', async () => {
      api.get.mockRejectedValueOnce(new Error('Authentication failed'));
      mockLocalStorage.getItem.mockImplementation((key) =>
        key === 'token' ? 'invalid_token' : null
      );

      renderComponent();
      await waitFor(() => {
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      });
    });
  });

  describe('Authentication Flow', () => {
    test('should login successfully with valid credentials', async () => {
      renderComponent();
      await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());

      fireEvent.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', 'test_jwt_token');
      });

      await waitFor(() => {
        expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
        expect(screen.getByTestId('user-name')).toHaveTextContent('Test User');
        expect(screen.getByTestId('user-role')).toHaveTextContent('user');
      });
    });

    test('should handle login failure gracefully', async () => {
      api.post.mockRejectedValueOnce(new Error('Invalid credentials'));
      renderComponent();

      await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());
      fireEvent.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByText('Login failed: Invalid credentials')).toBeInTheDocument();
      });
    });

    test('should logout successfully', async () => {
      renderComponent();

      await act(async () => {
        fireEvent.click(screen.getByText('Login'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user-info')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Logout'));
      });

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/auth/logout');
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      });
    });

    test('should refresh token automatically when expired', async () => {
      api.get.mockResolvedValueOnce({
        data: { user: { id: 'user_123', email: 'test@example.com' } }
      });

      renderComponent();

      await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());

      const error = new Error('Unauthorized');
      error.response = { status: 401 };

      await act(async () => {
        try {
          await api.get('/api/protected');
        } catch {}
      });

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/auth/refresh');
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', 'new_token');
      });
    });
  });

  describe('Protected Routes', () => {
    test('should block access when not authenticated', async () => {
      api.get.mockRejectedValueOnce(new Error('Not authenticated'));
      renderComponent();

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // In your AuthContext, you would normally handle redirect — mock window.location
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
    });

    test('should allow access when authenticated', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('user-info')).toBeInTheDocument();
    });
  });

  describe('Token Management', () => {
    test('should persist token across reloads', async () => {
      mockLocalStorage.getItem.mockImplementation((key) =>
        key === 'token' ? 'persisted_token' : null
      );

      renderComponent();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/auth/me', {
          headers: { Authorization: 'Bearer persisted_token' }
        });
      });
    });

    test('should clear token on logout', async () => {
      renderComponent();

      await act(async () => {
        fireEvent.click(screen.getByText('Login'));
      });

      await waitFor(() => expect(screen.getByTestId('user-info')).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(screen.getByText('Logout'));
      });

      await waitFor(() => {
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors during authentication', async () => {
      api.post.mockRejectedValueOnce(new Error('Network error'));
      renderComponent();

      await waitFor(() => expect(screen.queryByTestId('loading')).not.toBeInTheDocument());
      fireEvent.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByText('Login failed: Network error')).toBeInTheDocument();
      });
    });

    test('should handle server errors gracefully', async () => {
      api.get.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'Server error' } }
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Authentication failed: Server error')).toBeInTheDocument();
      });
    });
  });
});