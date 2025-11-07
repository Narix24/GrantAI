import { createTheme, responsiveFontSizes } from '@mui/material/styles';

export const createAppTheme = (mode) => {
  const baseTheme = createTheme({
    palette: {
      mode,
      primary: {
        main: '#6366f1', // indigo-500
        dark: '#4f46e5', // indigo-600
        light: '#818cf8', // indigo-400
        contrastText: '#ffffff'
      },
      secondary: {
        main: '#10b981', // emerald-500
        dark: '#059669', // emerald-600
        light: '#34d399', // emerald-400
      },
      success: {
        main: '#10b981',
        light: '#34d399',
        dark: '#059669'
      },
      warning: {
        main: '#f59e0b', // amber-500
        light: '#fbbf24',
        dark: '#b45309'
      },
      error: {
        main: '#ef4444', // red-500
        light: '#f87171',
        dark: '#b91c1c'
      },
      info: {
        main: '#3b82f6', // blue-500
        light: '#60a5fa',
        dark: '#1d4ed8'
      },
      background: {
        default: mode === 'dark' ? '#0f172a' : '#f8fafc', // slate-50 / slate-900
        paper: mode === 'dark' ? '#1e293b' : '#ffffff', // slate-800 / white
      },
      text: {
        primary: mode === 'dark' ? '#f1f5f9' : '#1e293b', // slate-100 / slate-900
        secondary: mode === 'dark' ? '#94a3b8' : '#64748b', // slate-400 / slate-500
        disabled: mode === 'dark' ? '#64748b' : '#94a3b8'
      },
      divider: mode === 'dark' ? '#334155' : '#e2e8f0', // slate-700 / slate-200
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
      h1: {
        fontWeight: 700,
        fontSize: '2.5rem',
        lineHeight: 1.2
      },
      h2: {
        fontWeight: 700,
        fontSize: '2rem',
        lineHeight: 1.3
      },
      h3: {
        fontWeight: 700,
        fontSize: '1.75rem',
        lineHeight: 1.4
      },
      h4: {
        fontWeight: 700,
        fontSize: '1.5rem',
        lineHeight: 1.5
      },
      h5: {
        fontWeight: 600,
        fontSize: '1.25rem',
        lineHeight: 1.5
      },
      h6: {
        fontWeight: 600,
        fontSize: '1.125rem',
        lineHeight: 1.5
      },
      body1: {
        fontSize: '1rem',
        lineHeight: 1.6
      },
      body2: {
        fontSize: '0.875rem',
        lineHeight: 1.6
      },
      button: {
        fontWeight: 600,
        textTransform: 'none'
      }
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: '0.75rem',
            textTransform: 'none',
            fontWeight: 600,
            padding: '0.75rem 1.5rem',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              boxShadow: 'var(--shadow-md)'
            }
          },
          containedPrimary: {
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            '&:hover': {
              background: 'linear-gradient(135deg, #4f46e5, #4338ca)'
            }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: '1rem',
            boxShadow: 'var(--shadow-md)',
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              boxShadow: 'var(--shadow-lg)'
            }
          }
        }
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: '0.75rem',
              '& fieldset': {
                borderColor: mode === 'dark' ? '#334155' : '#cbd5e1',
              },
              '&:hover fieldset': {
                borderColor: '#6366f1',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#6366f1',
                borderWidth: '2px',
              }
            }
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none', // Remove default background image
            backgroundColor: mode === 'dark' ? '#1e293b' : '#ffffff',
            borderRadius: '1rem'
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'dark' ? '#0f172a' : '#ffffff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            borderBottom: `1px solid ${mode === 'dark' ? '#334155' : '#e2e8f0'}`
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#1e293b' : '#ffffff',
            color: mode === 'dark' ? '#f1f5f9' : '#1e293b',
            border: `1px solid ${mode === 'dark' ? '#334155' : '#e2e8f0'}`,
            boxShadow: 'var(--shadow-md)',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            padding: '0.5rem 0.75rem'
          }
        }
      }
    },
    shape: {
      borderRadius: 16
    },
    transitions: {
      duration: {
        shortest: 150,
        shorter: 200,
        short: 250,
        standard: 300,
        complex: 375,
        enteringScreen: 225,
        leavingScreen: 195
      }
    },
    zIndex: {
      appBar: 1200,
      drawer: 1100,
      modal: 1300,
      snackbar: 1400,
      tooltip: 1500
    }
  });

  // Make font sizes responsive
  return responsiveFontSizes(baseTheme);
};