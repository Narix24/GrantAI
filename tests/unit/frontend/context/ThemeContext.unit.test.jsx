import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, useThemeContext } from '../../../../../frontend/context/ThemeContext';
import { createTheme } from '../../../../../frontend/styles/theme';

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

// Mock Material-UI components
jest.mock('@mui/material/Card', () => ({ children, ...props }) => (
  <div className="card" style={props.style}>{children}</div>
));
jest.mock('@mui/material/CardContent', () => ({ children, ...props }) => (
  <div className="card-content" style={props.style}>{children}</div>
));
jest.mock('@mui/material/Typography', () => ({ children, variant, ...props }) => (
  <div className={`typography ${variant}`} style={props.style}>{children}</div>
));

// Test component using ThemeContext
const TestComponent = () => {
  const { mode, toggleColorMode, theme } = useThemeContext();

  return (
    <div data-testid="theme-container">
      <div data-testid="current-theme">{mode}</div>
      <button onClick={toggleColorMode} data-testid="toggle-theme">
        Toggle Theme
      </button>
      <div
        data-testid="themed-card"
        style={{
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary
        }}
      >
        <div data-testid="card-title" style={{ fontWeight: 600, color: theme.palette.text.primary }}>
          Themed Card
        </div>
        <p data-testid="card-content">This card should change appearance with theme</p>
      </div>
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      </MemoryRouter>
    );
  };

  describe('Initial Theme', () => {
    test('should use light mode when no preference is saved', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      renderComponent();

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    test('should use dark mode when preference is saved', () => {
      mockLocalStorage.getItem.mockReturnValue('dark');
      renderComponent();

      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    test('should respect system preference when no saved preference', () => {
      // Mock system prefers dark mode
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        addListener: jest.fn(),
        removeListener: jest.fn()
      }));

      mockLocalStorage.getItem.mockReturnValue(null);

      renderComponent();

      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('Theme Toggle', () => {
    test('should toggle between light and dark mode', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      renderComponent();

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');

      fireEvent.click(screen.getByTestId('toggle-theme'));

      await waitFor(() => {
        expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      });

      fireEvent.click(screen.getByTestId('toggle-theme'));

      await waitFor(() => {
        expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      });
    });

    test('should persist theme preference in localStorage', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      renderComponent();

      fireEvent.click(screen.getByTestId('toggle-theme'));

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
      });
    });
  });

  describe('MUI Theme Integration', () => {
    test('should apply light theme colors', () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      renderComponent();

      const card = screen.getByTestId('themed-card');
      expect(card).toHaveStyle({
        backgroundColor: '#ffffff',
        color: '#1e293b'
      });
    });

    test('should apply dark theme colors', () => {
      mockLocalStorage.getItem.mockReturnValue('dark');
      renderComponent();

      const card = screen.getByTestId('themed-card');
      expect(card).toHaveStyle({
        backgroundColor: '#1e293b',
        color: '#f1f5f9'
      });
    });

    test('should update theme colors when toggling', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      renderComponent();

      let card = screen.getByTestId('themed-card');
      expect(card).toHaveStyle({ backgroundColor: '#ffffff' });

      fireEvent.click(screen.getByTestId('toggle-theme'));

      await waitFor(() => {
        card = screen.getByTestId('themed-card');
        expect(card).toHaveStyle({ backgroundColor: '#1e293b' });
      });
    });
  });

  describe('Typography and Components', () => {
    test('should apply correct typography for light theme', () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      renderComponent();

      const title = screen.getByTestId('card-title');
      expect(title).toHaveStyle({
        fontWeight: '600',
        color: '#1e293b'
      });
    });

    test('should apply correct typography for dark theme', () => {
      mockLocalStorage.getItem.mockReturnValue('dark');
      renderComponent();

      const title = screen.getByTestId('card-title');
      expect(title).toHaveStyle({
        fontWeight: '600',
        color: '#f1f5f9'
      });
    });

    test('should maintain content during theme changes', async () => {
      mockLocalStorage.getItem.mockReturnValue('light');
      renderComponent();

      const content = screen.getByTestId('card-content');
      expect(content).toHaveTextContent('This card should change appearance with theme');

      fireEvent.click(screen.getByTestId('toggle-theme'));

      await waitFor(() => {
        expect(screen.getByTestId('card-content')).toHaveTextContent(
          'This card should change appearance with theme'
        );
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle invalid theme preference gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid_theme');
      renderComponent();

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    });

    test('should handle localStorage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      renderComponent();

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    });
  });
});