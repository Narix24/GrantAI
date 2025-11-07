// frontend/src/components/kpi/RealTimeMetrics.jsx
import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { Box, Typography, Grid, Card, CardContent, LinearProgress, useTheme } from '@mui/material';
import { WebSocketContext } from '../../context/WebSocketContext';
import {
  Speed,
  Memory,
  Computer as Cpu,
  Lan as Network,
  Queue as QueueIcon,
  Storage as Database
} from '@mui/icons-material';

export default function RealTimeMetrics() {
  const theme = useTheme();
  const { socket } = useContext(WebSocketContext);
  const [metrics, setMetrics] = useState({
    cpu: 0,
    memory: 0,
    network: 0,
    queue: { waiting: 0, active: 0, failed: 0 },
    database: { queriesPerSecond: 0, latency: 0 },
    throughput: 0
  });
  const [history, setHistory] = useState({
    cpu: Array(60).fill(0),
    memory: Array(60).fill(0),
    throughput: Array(60).fill(0)
  });
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const handleMetrics = (data) => {
      setMetrics(prev => ({
        ...prev,
        ...data,
        timestamp: Date.now()
      }));

      setHistory(prev => ({
        cpu: [...prev.cpu.slice(1), data.cpu || 0],
        memory: [...prev.memory.slice(1), data.memory || 0],
        throughput: [...prev.throughput.slice(1), data.throughput || 0]
      }));
    };

    socket.on('realtime_metrics', handleMetrics);
    socket.emit('subscribe_metrics', { interval: 1000 });

    return () => {
      socket.off('realtime_metrics', handleMetrics);
      socket.emit('unsubscribe_metrics');
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const getUtilizationColor = (value, warningThreshold = 70, dangerThreshold = 90) => {
    if (value >= dangerThreshold) return theme.palette.error.main;
    if (value >= warningThreshold) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        gutterBottom
        sx={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}
      >
        <Speed sx={{ mr: 1 }} /> Real-time System Metrics
      </Typography>

      <Grid container spacing={2}>
        {/* CPU Usage */}
        <Grid item xs={12} md={4}>
          <MetricCard
            title="CPU Usage"
            icon={<Cpu />}
            value={metrics.cpu}
            history={history.cpu}
            thresholds={{ warning: 70, danger: 90 }}
          />
        </Grid>

        {/* Memory Usage */}
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Memory Usage"
            icon={<Memory />}
            value={metrics.memory}
            history={history.memory}
            thresholds={{ warning: 80, danger: 95 }}
            unit="%"
          />
        </Grid>

        {/* Throughput */}
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Requests/sec"
            icon={<Network />}
            value={metrics.throughput}
            history={history.throughput}
            thresholds={{ warning: 100, danger: 200 }}
            unit=""
          />
        </Grid>

        {/* Job Queue */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography
                variant="h6"
                sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', mb: 2 }}
              >
                <QueueIcon sx={{ mr: 1 }} /> Job Queue Status
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <QueueMetric
                    label="Waiting"
                    value={metrics.queue.waiting}
                    color={theme.palette.info.main}
                  />
                </Grid>
                <Grid item xs={4}>
                  <QueueMetric
                    label="Active"
                    value={metrics.queue.active}
                    color={theme.palette.success.main}
                  />
                </Grid>
                <Grid item xs={4}>
                  <QueueMetric
                    label="Failed"
                    value={metrics.queue.failed}
                    color={theme.palette.error.main}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Database Performance */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography
                variant="h6"
                sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', mb: 2 }}
              >
                <Database sx={{ mr: 1 }} /> Database Performance
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Queries/Second: {metrics.database.queriesPerSecond}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(metrics.database.queriesPerSecond, 100)}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'divider',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: getUtilizationColor(metrics.database.queriesPerSecond, 50, 80)
                      }
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Avg. Latency: {metrics.database.latency.toFixed(1)}ms
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(metrics.database.latency, 100)}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'divider',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: getUtilizationColor(metrics.database.latency, 50, 100)
                      }
                    }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function MetricCard({ title, icon, value, history, thresholds, unit = '%' }) {
  const theme = useTheme();
  const normalizedValue = value;
  const displayValue = normalizedValue.toFixed(1);

  const getUtilizationColor = (val, warningThreshold, dangerThreshold) => {
    if (val >= dangerThreshold) return theme.palette.error.main;
    if (val >= warningThreshold) return theme.palette.warning.main;
    return theme.palette.success.main;
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', mb: 2 }}
        >
          {icon}
          <span style={{ marginLeft: 8 }}>{title}</span>
        </Typography>

        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            color: getUtilizationColor(normalizedValue, thresholds.warning, thresholds.danger),
            mb: 2
          }}
        >
          {displayValue}
          {unit}
        </Typography>

        <Box sx={{ width: '100%', height: 60, position: 'relative' }}>
          {history.slice(-10).map((point, index) => {
            const height = Math.min(point / (thresholds.danger || 100) * 100, 100);
            return (
              <Box
                key={index}
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: `${(index / 9) * 100}%`,
                  width: 4,
                  height: `${height}%`,
                  bgcolor: getUtilizationColor(point, thresholds.warning, thresholds.danger),
                  borderRadius: 1,
                  opacity: 0.7
                }}
              />
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}

function QueueMetric({ label, value, color }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
          bgcolor: `${color}20`,
          border: `2px solid ${color}`
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}
