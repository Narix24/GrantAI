import { useState, useEffect, useMemo } from 'react';
import { Box, Grid, Typography, Card, CardContent, useTheme } from '@mui/material';
import { 
  TrendingUp, 
  TrendingDown, 
  HourglassEmpty, 
  PeopleAlt,
  SyncProblem,
  CheckCircle
} from '@mui/icons-material';
import { useWebSocket } from '../../context/WebSocketContext'; // ✅ fixed import

export default function KPIDashboard() {
  const theme = useTheme();
  const [kpis, setKpis] = useState({
    proposalsGenerated: 0,
    successRate: 0,
    systemLatency: 0,
    activeUsers: 0,
    systemHealth: 'checking'
  });

  const { socket } = useWebSocket(); // ✅ use hook instead of context directly

  useEffect(() => {
    if (!socket) return;
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'kpi_update') {
          setKpis(prev => ({
            ...prev,
            ...data.payload,
            systemHealth: data.payload.systemHealth || 'optimal'
          }));
        }
      } catch (err) {
        console.error('Invalid KPI update:', err);
      }
    };

    socket.send(JSON.stringify({ type: 'request_kpis' }));

    return () => {
      socket.onmessage = null;
    };
  }, [socket]);

  const healthStatus = useMemo(() => {
    switch (kpis.systemHealth) {
      case 'optimal':
        return { color: theme.palette.success.main, icon: <CheckCircle /> };
      case 'degraded':
        return { color: theme.palette.warning.main, icon: <SyncProblem /> };
      case 'critical':
        return { color: theme.palette.error.main, icon: <SyncProblem /> };
      default:
        return { color: theme.palette.info.main, icon: <HourglassEmpty /> };
    }
  }, [kpis.systemHealth, theme]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        System Performance Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Card sx={{ 
            height: '100%',
            bgcolor: healthStatus.color + '10',
            border: `1px solid ${healthStatus.color}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                {healthStatus.icon}
                <Typography variant="h6" sx={{ ml: 1, fontWeight: 600 }}>
                  System Health
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ 
                fontWeight: 700,
                color: healthStatus.color
              }}>
                {kpis.systemHealth.toUpperCase()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last updated: {new Date().toLocaleTimeString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <MetricCard
            title="Proposals Generated"
            value={kpis.proposalsGenerated.toLocaleString()}
            icon={<TrendingUp />}
            trend={4.2}
            trendText="from last week"
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <MetricCard
            title="Success Rate"
            value={`${kpis.successRate.toFixed(1)}%`}
            icon={<CheckCircle />}
            trend={kpis.successRate - 95.0}
            trendText="vs target"
            isPercentage={true}
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <MetricCard
            title="Active Users"
            value={kpis.activeUsers.toLocaleString()}
            icon={<PeopleAlt />}
            trend={2.1}
            trendText="new today"
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <MetricCard
            title="System Latency"
            value={`${kpis.systemLatency}ms`}
            icon={<HourglassEmpty />}
            trend={-15}
            trendText="improvement"
            warningThreshold={2000}
            errorThreshold={5000}
          />
        </Grid>
      </Grid>

      <SystemHealthDetails 
        healthStatus={kpis.systemHealth} 
        latency={kpis.systemLatency} 
      />
    </Box>
  );
}

function MetricCard({ title, value, icon, trend, trendText, isPercentage = false, warningThreshold, errorThreshold }) {
  const theme = useTheme();
  const isPositiveGood = !title.toLowerCase().includes('latency');

  let trendColor = trend > 0 && isPositiveGood ? 'success' : 
                  trend < 0 && !isPositiveGood ? 'success' :
                  'error';

  if (title.toLowerCase().includes('latency') && trend < 0) {
    trendColor = 'success';
  }

  let statusColor = theme.palette.success.main;
  if (errorThreshold && parseFloat(value) > errorThreshold) {
    statusColor = theme.palette.error.main;
  } else if (warningThreshold && parseFloat(value) > warningThreshold) {
    statusColor = theme.palette.warning.main;
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {icon}
          <Typography variant="h6" sx={{ ml: 1, fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
        <Typography 
          variant="h4" 
          sx={{ 
            fontWeight: 700,
            color: statusColor
          }}
        >
          {value}{isPercentage ? '%' : ''}
        </Typography>
        {trend !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            {trend > 0 ? <TrendingUp color={trendColor} /> : <TrendingDown color={trendColor} />}
            <Typography 
              variant="body2" 
              sx={{ 
                color: theme.palette[trendColor].main,
                fontWeight: 500,
                ml: 0.5
              }}
            >
              {Math.abs(trend).toFixed(1)}%
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {trendText}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function SystemHealthDetails({ healthStatus, latency }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  
  const services = [
    { name: 'Database', status: latency < 100 ? 'optimal' : 'degraded' },
    { name: 'AI Engine', status: latency < 500 ? 'optimal' : 'degraded' },
    { name: 'Vector Store', status: 'optimal' },
    { name: 'Job Queue', status: 'optimal' },
    { name: 'Email Service', status: 'optimal' }
  ];

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            cursor: 'pointer'
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Service Health Details
          </Typography>
          <SyncProblem 
            sx={{ 
              color: healthStatus === 'optimal' ? theme.palette.success.main : theme.palette.warning.main,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.3s'
            }} 
          />
        </Box>
        
        {expanded && (
          <Grid container spacing={2} sx={{ mt: 2 }}>
            {services.map((service, index) => (
              <Grid item xs={12} md={4} key={index}>
                <ServiceStatus 
                  name={service.name} 
                  status={service.status} 
                />
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceStatus({ name, status }) {
  const theme = useTheme();
  const statusConfig = {
    optimal: { 
      color: theme.palette.success.main,
      label: 'OPTIMAL'
    },
    degraded: { 
      color: theme.palette.warning.main,
      label: 'DEGRADED'
    },
    critical: { 
      color: theme.palette.error.main,
      label: 'CRITICAL'
    }
  };

  return (
    <Box sx={{ 
      p: 2, 
      border: `1px solid ${statusConfig[status].color}`,
      borderRadius: 2,
      bgcolor: statusConfig[status].color + '10'
    }}>
      <Typography variant="body1" fontWeight={600}>
        {name}
      </Typography>
      <Typography 
        variant="body2" 
        sx={{ 
          color: statusConfig[status].color,
          fontWeight: 600,
          mt: 0.5
        }}
      >
        {statusConfig[status].label}
      </Typography>
    </Box>
  );
}
