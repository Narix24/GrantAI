import { useState, useEffect } from 'react';
import { Box, Button, Select, MenuItem, InputLabel, FormControl, Typography, Card, CardContent, Grid, LinearProgress, Alert, useTheme, IconButton } from '@mui/material';
import { Science, PlayArrow, Stop, BugReport, Speed, AutoAwesome, SettingsSuggest } from '@mui/icons-material';
import { WebSocketContext } from '../../context/WebSocketContext';

export default function ChaosControls() {
  const theme = useTheme();
  const { socket } = useContext(WebSocketContext);
  const [experiments, setExperiments] = useState([]);
  const [activeExperiments, setActiveExperiments] = useState([]);
  const [experimentType, setExperimentType] = useState('latency');
  const [experimentDuration, setExperimentDuration] = useState(30);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [systemImpact, setSystemImpact] = useState(0);
  const [recoveryStatus, setRecoveryStatus] = useState(null);

  useEffect(() => {
    if (!socket) return;
    
    // Subscribe to chaos updates
    socket.on('chaos_update', (data) => {
      setActiveExperiments(data.activeExperiments || []);
      setSystemImpact(data.systemImpact || 0);
      setRecoveryStatus(data.recoveryStatus || null);
    });
    
    socket.emit('request_chaos_status');
    
    return () => {
      socket.off('chaos_update');
    };
  }, [socket]);

  useEffect(() => {
    fetchExperiments();
  }, []);

  const fetchExperiments = async () => {
    try {
      const response = await fetch('/api/system/chaos-experiments', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch experiments');
      }
      
      const data = await response.json();
      setExperiments(data.experiments);
    } catch (err) {
      setError('Failed to load experiments: ' + err.message);
    }
  };

  const runExperiment = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/system/chaos-trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          experimentType,
          duration: parseInt(experimentDuration),
          targetService: 'all'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Experiment failed');
      }
      
      const result = await response.json();
      setSuccess(`Experiment started successfully! ID: ${result.experimentId}`);
      
      // Update local state immediately
      setActiveExperiments(prev => [
        ...prev,
        {
          id: result.experimentId,
          type: experimentType,
          duration: parseInt(experimentDuration),
          startTime: new Date().toISOString(),
          status: 'running'
        }
      ]);
      
      // Auto-clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError('Experiment failed: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const stopExperiment = async (experimentId) => {
    try {
      const response = await fetch('/api/system/chaos-stop', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ experimentId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to stop experiment');
      }
      
      // Update local state
      setActiveExperiments(prev => prev.filter(exp => exp.id !== experimentId));
      setSuccess('Experiment stopped successfully');
    } catch (err) {
      setError('Failed to stop experiment: ' + err.message);
    }
  };

  const triggerRecovery = async () => {
    try {
      const response = await fetch('/api/system/recovery-trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          failureType: 'manual_recovery',
          context: { triggeredBy: 'admin_ui' }
        })
      });
      
      if (!response.ok) {
        throw new Error('Recovery trigger failed');
      }
      
      setSuccess('Recovery process initiated successfully');
    } catch (err) {
      setError('Recovery trigger failed: ' + err.message);
    }
  };

  const getExperimentConfig = (type) => {
    const configs = {
      latency: {
        icon: <Speed />,
        description: 'Inject network latency to test timeout handling',
        impact: 'medium',
        recommendedDuration: '30-60 seconds'
      },
      connection_reset: {
        icon: <Network />,
        description: 'Simulate connection resets to test retry logic',
        impact: 'high',
        recommendedDuration: '15-30 seconds'
      },
      provider_failure: {
        icon: <CloudOff />,
        description: 'Simulate AI provider failures to test fallbacks',
        impact: 'medium',
        recommendedDuration: '45-90 seconds'
      },
      db_disconnect: {
        icon: <Database />,
        description: 'Simulate database disconnections to test recovery',
        impact: 'high',
        recommendedDuration: '20-40 seconds'
      },
      memory_leak: {
        icon: <Memory />,
        description: 'Simulate memory leaks to test resource monitoring',
        impact: 'critical',
        recommendedDuration: '10-20 seconds'
      }
    };
    
    return configs[type] || configs.latency;
  };

  const getImpactColor = (impact) => {
    switch(impact) {
      case 'low': return theme.palette.success.main;
      case 'medium': return theme.palette.warning.main;
      case 'high': return theme.palette.error.main;
      case 'critical': return theme.palette.error.dark;
      default: return theme.palette.info.main;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center' }}>
        <Science sx={{ mr: 1.5, fontSize: 32 }} /> Chaos Engineering Controls
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Run Chaos Experiment
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Experiment Type</InputLabel>
                  <Select
                    value={experimentType}
                    label="Experiment Type"
                    onChange={(e) => setExperimentType(e.target.value)}
                    disabled={isRunning}
                  >
                    {experiments.map((exp) => {
                      const config = getExperimentConfig(exp.type);
                      return (
                        <MenuItem key={exp.type} value={exp.type}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {config.icon}
                            {exp.name} - {config.impact.toUpperCase()}
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Duration (seconds)</InputLabel>
                  <Select
                    value={experimentDuration}
                    label="Duration (seconds)"
                    onChange={(e) => setExperimentDuration(e.target.value)}
                    disabled={isRunning}
                  >
                    {[10, 15, 20, 30, 45, 60, 90, 120].map((duration) => (
                      <MenuItem key={duration} value={duration}>
                        {duration} seconds
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                  Current System Impact: {systemImpact.toFixed(1)}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={systemImpact}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    bgcolor: 'divider',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: systemImpact > 80 ? theme.palette.error.main :
                              systemImpact > 50 ? theme.palette.warning.main : theme.palette.success.main
                    }
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  {systemImpact > 80 ? '⚠️ High system load - proceed with caution' :
                   systemImpact > 50 ? 'ℹ️ Moderate system load' :
                   '✅ Low system load - safe to run experiments'}
                </Typography>
              </Box>
              
              <Button
                fullWidth
                variant="contained"
                onClick={runExperiment}
                disabled={isRunning || systemImpact > 80}
                startIcon={isRunning ? <CircularProgress size={20} /> : <PlayArrow />}
                sx={{ 
                  height: 56,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  bgcolor: systemImpact > 80 ? theme.palette.warning.main : theme.palette.error.main,
                  '&:hover': {
                    bgcolor: systemImpact > 80 ? theme.palette.warning.dark : theme.palette.error.dark
                  }
                }}
              >
                {isRunning ? 'Running Experiment...' : 'Start Chaos Experiment'}
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center' }}>
                <SettingsSuggest sx={{ mr: 1 }} /> Recovery Controls
              </Typography>
              
              <Typography variant="body1" sx={{ mb: 2 }}>
                Manual recovery trigger for failed services or persistent issues.
              </Typography>
              
              <Button
                fullWidth
                variant="outlined"
                onClick={triggerRecovery}
                startIcon={<AutoAwesome />}
                sx={{ height: 56 }}
              >
                Trigger System Recovery
              </Button>
              
              {recoveryStatus && (
                <Box sx={{ mt: 2, p: 2, bgcolor: recoveryStatus.success ? 'success.light' : 'error.light', borderRadius: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    Last Recovery: {recoveryStatus.timestamp}
                  </Typography>
                  <Typography variant="body2" color={recoveryStatus.success ? 'success.main' : 'error.main'}>
                    Status: {recoveryStatus.success ? '✅ Successful' : '❌ Failed'}
                  </Typography>
                  {recoveryStatus.message && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {recoveryStatus.message}
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center' }}>
                <BugReport sx={{ mr: 1 }} /> Active Experiments
              </Typography>
              
              {activeExperiments.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No active chaos experiments running
                </Typography>
              ) : (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 2,
                  maxHeight: 400,
                  overflow: 'auto'
                }}>
                  {activeExperiments.map((experiment) => {
                    const config = getExperimentConfig(experiment.type);
                    const elapsed = (Date.now() - new Date(experiment.startTime)) / 1000;
                    const progress = Math.min((elapsed / experiment.duration) * 100, 100);
                    
                    return (
                      <Card key={experiment.id} sx={{ 
                        border: `1px solid ${getImpactColor(config.impact)}`,
                        bgcolor: getImpactColor(config.impact) + '10'
                      }}>
                        <CardContent sx={{ p: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {config.icon}
                              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                {experiment.type.replace('_', ' ').toUpperCase()}
                              </Typography>
                            </Box>
                            <IconButton 
                              size="small" 
                              onClick={() => stopExperiment(experiment.id)}
                              sx={{ 
                                bgcolor: theme.palette.error.main + '20',
                                '&:hover': { bgcolor: theme.palette.error.main + '30' }
                              }}
                            >
                              <Stop sx={{ color: theme.palette.error.main, fontSize: 20 }} />
                            </IconButton>
                          </Box>
                          
                          <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                              Duration: {experiment.duration}s | Elapsed: {elapsed.toFixed(0)}s
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={progress}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                mt: 1,
                                bgcolor: 'divider',
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: getImpactColor(config.impact)
                                }
                              }}
                            />
                          </Box>
                          
                          <Typography variant="body2" sx={{ 
                            color: getImpactColor(config.impact),
                            fontWeight: 500,
                            fontSize: '0.85rem'
                          }}>
                            Impact Level: {config.impact.toUpperCase()} | Started: {new Date(experiment.startTime).toLocaleTimeString()}
                          </Typography>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Experiment Configuration
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                  Selected Experiment: {experimentType.replace('_', ' ').toUpperCase()}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {getExperimentConfig(experimentType).icon}
                  <Typography variant="body2" color="text.secondary">
                    {getExperimentConfig(experimentType).description}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Recommended Duration: {getExperimentConfig(experimentType).recommendedDuration}
                </Typography>
              </Box>
              
              <Box sx={{ 
                p: 2, 
                bgcolor: getImpactColor(getExperimentConfig(experimentType).impact) + '10',
                borderRadius: 1,
                border: `1px solid ${getImpactColor(getExperimentConfig(experimentType).impact)}`
              }}>
                <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                  Impact Level: {getExperimentConfig(experimentType).impact.toUpperCase()}
                </Typography>
                <Typography variant="body2" color={getImpactColor(getExperimentConfig(experimentType).impact)}>
                  {getExperimentConfig(experimentType).impact === 'critical' && '⚠️ CRITICAL IMPACT - Only run in staging environments'}
                  {getExperimentConfig(experimentType).impact === 'high' && '⚠️ HIGH IMPACT - Monitor system closely'}
                  {getExperimentConfig(experimentType).impact === 'medium' && 'ℹ️ MEDIUM IMPACT - Standard testing'}
                  {getExperimentConfig(experimentType).impact === 'low' && '✅ LOW IMPACT - Safe for production'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}