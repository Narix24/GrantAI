import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    // Get saved theme from localStorage or system preference
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    // Save theme to localStorage
    localStorage.setItem('theme', mode);
    
    // Update document data-theme attribute
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const colorMode = useMemo(
    () => ({ toggleColorMode, mode }),
    [mode]
  );

  // Create MUI theme
  const theme = useMemo(
    () => createTheme({
      palette: {
        mode,
        primary: {
          main: '#6366f1',
          dark: '#4f46e5',
          light: '#818cf8'
        },
        secondary: {
          main: '#10b981',
          dark: '#059669',
          light: '#34d399'
        },
        background: {
          default: mode === 'dark' ? '#0f172a' : '#f8fafc',
          paper: mode === 'dark' ? '#1e293b' : '#ffffff'
        },
        text: {
          primary: mode === 'dark' ? '#f1f5f9' : '#1e293b',
          secondary: mode === 'dark' ? '#94a3b8' : '#64748b'
        }
      },
      typography: {
        fontFamily: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif'
        ].join(','),
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: '0.75rem',
              textTransform: 'none',
              fontWeight: 600
            }
          }
        },
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: '1rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'
            }
          }
        }
      }
    }),
    [mode]
  );

  return (
    <ThemeContext.Provider value={colorMode}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  return useContext(ThemeContext);
}