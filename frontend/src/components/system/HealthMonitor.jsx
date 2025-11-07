// frontend/src/components/system/HealthMonitor.jsx
import { useState, useEffect, useCallback, useContext } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  useTheme,
  Button,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  HealthAndSafety,
  Storage as Database,
  Cloud,
  Speed,
  Memory,
  Dns as Cpu,                // MUI has no 'Cpu' icon; alias Dns as Cpu
  Queue,
  CheckCircle,
  Error,
  Warning,
  AutoAwesome,
  SettingsBackupRestore,
  Tag,
  Code,
  People,
  Refresh
} from '@mui/icons-material';
import { WebSocketContext } from '../../context/WebSocketContext';

export default function HealthMonitor() {
  const theme = useTheme();
  const { socket } = useContext(WebSocketContext);
  const [healthData, setHealthData] = useState({
    overall: 'checking',
    services: {
      database: 'checking',
      ai: 'checking',
      vectorStore: 'checking',
      queue: 'checking',
      email: 'checking',
      crawler: 'checking'
    },
    metrics: {
      cpu: 0,
      memory: 0,
      latency: 0,
      throughput: 0,
      errorRate: 0
    },
    lastUpdate: null
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Listen for live updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'health_update') {
          setHealthData(prev => ({
            ...prev,
            ...data.payload,
            lastUpdate: new Date().toISOString()
          }));
        }
      } catch (err) {
        console.error('WebSocket health_update parse error:', err);
      }
    };

    socket.addEventListener('message', handleMessage);

    // Request initial health data
    socket.send(JSON.stringify({ type: 'request_health' }));

    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket]);

  // Manual refresh through REST API
  const refreshHealth = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch('/api/system/health', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) throw new Error('Health check failed');

      const data = await response.json();
      setHealthData(prev => ({
        ...prev,
        ...data,
        lastUpdate: new Date().toISOString()
      }));
    } catch (err) {
      setError('Failed to refresh health data: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // Periodic auto refresh
  useEffect(() => {
    const interval = setInterval(() => refreshHealth(), 30000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  const getServiceStatus = (status) => {
    const statusMap = {
      healthy: { color: theme.palette.success.main, icon: <CheckCircle />, label: 'HEALTHY' },
      degraded: { color: theme.palette.warning.main, icon: <Warning />, label: 'DEGRADED' },
      critical: { color: theme.palette.error.main, icon: <Error />, label: 'CRITICAL' },
      checking: { color: theme.palette.info.main, icon: <AutoAwesome />, label: 'CHECKING' },
      unavailable: { color: theme.palette.error.main, icon: <Error />, label: 'UNAVAILABLE' }
    };
    return statusMap[status] || statusMap.checking;
  };

  const getOverallStatus = () => getServiceStatus(healthData.overall);

  const handleRecovery = async (service) => {
    try {
      const response = await fetch('/api/system/recovery-trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          failureType: `${service}_failure`,
          context: { service, triggeredBy: 'health_ui' }
        })
      });

      if (!response.ok) throw new Error('Recovery trigger failed');

      setHealthData(prev => ({
        ...prev,
        services: { ...prev.services, [service]: 'recovering' }
      }));
    } catch (err) {
      setError(`Recovery failed for ${service}: ${err.message}`);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center' }}>
          <HealthAndSafety sx={{ mr: 1.5, fontSize: 32 }} /> System Health Monitor
        </Typography>
        <Button
          variant="contained"
          onClick={refreshHealth}
          disabled={isRefreshing}
          startIcon={isRefreshing ? <CircularProgress size={20} /> : <Refresh />}
          sx={{ height: 48 }}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Overall status */}
        <Grid item xs={12}>
          <Card
            sx={{
              bgcolor: getOverallStatus().color + '10',
              border: `1px solid ${getOverallStatus().color}`,
              mb: 3
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {getOverallStatus().icon}
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: getOverallStatus().color }}>
                      {getOverallStatus().label}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Overall system status
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" color="text.secondary">
                    Last updated:{' '}
                    {healthData.lastUpdate
                      ? new Date(healthData.lastUpdate).toLocaleTimeString()
                      : 'Never'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Individual service cards */}
        <Grid item xs={12}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Service Health Status
          </Typography>

          <Grid container spacing={2}>
            {Object.entries(healthData.services).map(([service, status]) => {
              const info = getServiceStatus(status);
              return (
                <Grid item xs={12} sm={6} md={4} key={service}>
                  <Card
                    sx={{
                      height: '100%',
                      border: `1px solid ${info.color}`,
                      transition: '0.2s',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: theme.shadows[2] }
                    }}
                  >
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                        {info.icon}
                        <Typography variant="h6" sx={{ ml: 1, fontWeight: 600 }}>
                          {service.replace(/([A-Z])/g, ' $1').toUpperCase()}
                        </Typography>
                      </Box>

                      <Typography
                        variant="h4"
                        sx={{ color: info.color, fontWeight: 700, fontSize: '1.5rem', mb: 1 }}
                      >
                        {info.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {getServiceDescription(service)}
                      </Typography>

                      {['degraded', 'critical'].includes(status) ? (
                        <Button
                          fullWidth
                          variant="contained"
                          onClick={() => handleRecovery(service)}
                          startIcon={<SettingsBackupRestore />}
                          sx={{
                            bgcolor: theme.palette.error.main + '20',
                            color: theme.palette.error.main,
                            '&:hover': { bgcolor: theme.palette.error.main + '30' }
                          }}
                        >
                          Trigger Recovery
                        </Button>
                      ) : (
                        <Box
                          sx={{
                            p: 1.5,
                            bgcolor:
                              status === 'healthy'
                                ? theme.palette.success.main + '10'
                                : theme.palette.info.main + '10',
                            borderRadius: 1,
                            textAlign: 'center'
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              color:
                                status === 'healthy'
                                  ? theme.palette.success.main
                                  : theme.palette.info.main
                            }}
                          >
                            {status === 'healthy'
                              ? '✅ All systems operational'
                              : `ℹ️ ${info.label} - Monitoring...`}
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Grid>

        {/* Metrics section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center' }}>
                <Speed sx={{ mr: 1 }} /> Performance Metrics
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <MetricCard title="CPU Usage" value={healthData.metrics.cpu} icon={<Cpu />} thresholds={{ warning: 70, danger: 90 }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <MetricCard title="Memory Usage" value={healthData.metrics.memory} icon={<Memory />} thresholds={{ warning: 80, danger: 95 }} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <MetricCard title="Response Latency" value={healthData.metrics.latency} icon={<Speed />} thresholds={{ warning: 1000, danger: 2000 }} unit="ms" />
                </Grid>
                <Grid item xs={12} md={6}>
                  <MetricCard title="Error Rate" value={healthData.metrics.errorRate} icon={<Error />} thresholds={{ warning: 1, danger: 5 }} unit="%" />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ---------- Subcomponents ----------

function MetricCard({ title, value, icon, thresholds, unit = '%' }) {
  const theme = useTheme();
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          {icon}
          <Typography variant="h6" sx={{ ml: 1, fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>

        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1,
            color: getUtilizationColor(value, thresholds.warning, thresholds.danger, theme)
          }}
        >
          {value}
          {unit}
        </Typography>

        <LinearProgress
          variant="determinate"
          value={Math.min(value, 100)}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: 'divider',
            '& .MuiLinearProgress-bar': {
              bgcolor: getUtilizationColor(value, thresholds.warning, thresholds.danger, theme)
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function getUtilizationColor(value, warning, danger, theme) {
  if (value >= danger) return theme.palette.error.main;
  if (value >= warning) return theme.palette.warning.main;
  return theme.palette.success.main;
}

function getServiceDescription(service) {
  const descriptions = {
    database: 'MongoDB/SQLite database connections and query performance',
    ai: 'AI provider availability and response times (Gemini, OpenAI, Ollama)',
    vectorStore: 'ChromaDB vector store health and embedding operations',
    queue: 'BullMQ job queue processing and worker availability',
    email: 'SMTP email delivery service and DKIM signing',
    crawler: 'Grant discovery crawler and web scraping operations'
  };
  return descriptions[service] || 'Service monitoring';
}
