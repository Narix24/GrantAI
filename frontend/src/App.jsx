import React, {
  useState,
  useEffect,
  useContext,
  useMemo,
  createContext,
} from 'react'
import {
  ThemeProvider,
  createTheme,
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Grid,
  Card,
  CardContent,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'

// === Contexts ===
const AuthContext = createContext({ user: { name: 'Local User' } })
const WebSocketContext = createContext(null)
const ColorModeContext = createContext({ toggleColorMode: () => {} })

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user] = useState({ name: 'Local User' })
  return (
    <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
  )
}

export function WebSocketProvider({ children }) {
  return (
    <WebSocketContext.Provider value={null}>
      {children}
    </WebSocketContext.Provider>
  )
}

// === KPI Dashboard ===
function KPIDashboard() {
  const [data, setData] = useState({
    proposalsGenerated: 0,
    systemLatency: 0,
    successRate: 0,
  })
  const [history, setHistory] = useState([])

  useEffect(() => {
    let ws
    try {
      ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:3001/kpis')
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        setData(msg)
        setHistory((prev) => [...prev.slice(-19), { ...msg, time: new Date().toLocaleTimeString() }])
      }
    } catch {
      console.warn('WebSocket not available locally.')
    }
    return () => ws && ws.close()
  }, [])

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom fontWeight={700}>
        📊 KPI Dashboard
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Proposals Generated
              </Typography>
              <Typography variant="h4" fontWeight={700}>
                {data.proposalsGenerated.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                System Latency
              </Typography>
              <Typography
                variant="h4"
                fontWeight={700}
                color={data.systemLatency > 2000 ? 'error' : 'success'}
              >
                {data.systemLatency} ms
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Success Rate
              </Typography>
              <Typography
                variant="h4"
                fontWeight={700}
                color={data.successRate > 95 ? 'success' : 'warning'}
              >
                {data.successRate}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 5 }}>
        <Typography variant="h6" gutterBottom>
          📈 System Latency Trend
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="systemLatency" stroke="#8884d8" fill="#8884d8" />
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      <Box sx={{ mt: 5 }}>
        <Typography variant="h6" gutterBottom>
          ⚙️ Success Rate Over Time
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="successRate" stroke="#10b981" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  )
}

// === Other Placeholders (for future tabs) ===
function RealTimeMetrics() {
  return <div style={{ padding: 20 }}>⏱ Real-Time Metrics Placeholder</div>
}
function ProposalBuilder() {
  return <div style={{ padding: 20 }}>🧠 Proposal Builder Placeholder</div>
}
function HealthMonitor() {
  return <div style={{ padding: 20 }}>❤️ System Health Monitor Placeholder</div>
}
function ChaosControls() {
  return <div style={{ padding: 20 }}>🧨 Chaos Controls Placeholder</div>
}

// === Main App ===
function App() {
  const [mode, setMode] = useState(() => localStorage.getItem('theme') || 'system')
  const [language, setLanguage] = useState('en')

  useEffect(() => {
    localStorage.setItem('theme', mode)
  }, [mode])

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prev) => (prev === 'light' ? 'dark' : 'light'))
      },
    }),
    []
  )

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const themeToApply = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
    document.documentElement.setAttribute('data-theme', themeToApply)
  }, [mode])

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode:
            mode === 'system'
              ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
              : mode,
          primary: { main: '#6366f1', dark: '#4f46e5', light: '#818cf8' },
          secondary: { main: '#10b981' },
          error: { main: '#ef4444' },
          background: {
            default: mode === 'dark' ? '#0f172a' : '#f8fafc',
            paper: mode === 'dark' ? '#1e293b' : '#ffffff',
          },
        },
        typography: {
          fontFamily: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'].join(','),
        },
      }),
    [mode]
  )

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <WebSocketProvider>
          <AuthProvider>
            <AppContent language={language} setLanguage={setLanguage} />
          </AuthProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}

function AppContent({ language, setLanguage }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const colorMode = useContext(ColorModeContext)

  if (!user) return <div style={{ padding: 50 }}>Login Screen Placeholder</div>

  return (
    <div className="min-h-screen bg-background transition-colors duration-200">
      <AppBar position="fixed" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            🚀 Grant-AI
          </Typography>
          <IconButton color="inherit" onClick={colorMode.toggleColorMode}>
            {document.documentElement.getAttribute('data-theme') === 'dark' ? (
              <LightModeIcon />
            ) : (
              <DarkModeIcon />
            )}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', pt: 8 }}>
        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          {activeTab === 'dashboard' && <KPIDashboard />}
          {activeTab === 'metrics' && <RealTimeMetrics />}
          {activeTab === 'builder' && <ProposalBuilder />}
          {activeTab === 'health' && <HealthMonitor />}
          {activeTab === 'chaos' && <ChaosControls />}
        </Box>
      </Box>
    </div>
  )
}

export default App
