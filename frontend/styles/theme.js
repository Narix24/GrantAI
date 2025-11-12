import { createTheme as createMuiTheme } from '@mui/material/styles';

export const createTheme = (mode = 'light') => {
  const isDark = mode === 'dark';

  return createMuiTheme({
    palette: {
      mode,
      background: {
        default: isDark ? '#1e293b' : '#ffffff'
      },
      text: {
        primary: isDark ? '#f1f5f9' : '#1e293b'
      }
    },
    typography: {
      fontFamily: "'Inter', sans-serif",
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600
    }
  });
};