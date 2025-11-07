// frontend/src/components/proposal/ToneAnalyzer.jsx
import { useState, useEffect } from 'react';
import { Box, Typography, LinearProgress, Grid, Card, CardContent, Chip, useTheme, Tooltip } from '@mui/material';
import { TrendingUp, TrendingDown, Psychology, PsychologyAlt, AutoAwesome } from '@mui/icons-material';
import { Radar } from 'react-chartjs-2';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip as ChartTooltip, Legend } from 'chart.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, ChartTooltip, Legend);

export default function ToneAnalyzer({ analysis, onToneChange }) {
  const theme = useTheme();
  const [selectedTone, setSelectedTone] = useState(analysis?.primaryTone || 'formal');
  const [improvedContent, setImprovedContent] = useState('');

  useEffect(() => {
    if (analysis?.primaryTone) {
      setSelectedTone(analysis.primaryTone);
    }
  }, [analysis]);

  const handleToneChange = (tone) => {
    setSelectedTone(tone);
    if (onToneChange) {
      onToneChange(tone);
    }
  };

  const improveContent = async () => {
    try {
      const response = await fetch('/api/proposals/improve-tone', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          content: analysis.content,
          currentTone: analysis.primaryTone,
          targetTone: selectedTone
        })
      });
      
      if (!response.ok) {
        throw new Error('Improvement failed');
      }
      
      const result = await response.json();
      setImprovedContent(result.improvedContent);
    } catch (error) {
      console.error('Improvement failed:', error);
    }
  };

  const toneConfig = {
    formal: {
      color: theme.palette.primary.main,
      description: 'Professional, respectful, and objective language',
      keywords: ['respectfully', 'therefore', 'consequently', 'academic', 'institutional']
    },
    persuasive: {
      color: theme.palette.secondary.main,
      description: 'Emotionally engaging language that motivates action',
      keywords: ['urgent', 'critical', 'transformative', 'compelling', 'imperative']
    },
    technical: {
      color: theme.palette.info.main,
      description: 'Precise, jargon-heavy language focused on methodology',
      keywords: ['methodology', 'algorithm', 'specification', 'implementation', 'precise']
    },
    empathetic: {
      color: theme.palette.success.main,
      description: 'Compassionate language that acknowledges human impact',
      keywords: ['community', 'impact', 'compassion', 'understanding', 'human']
    }
  };

  const getChartData = () => {
    if (!analysis?.toneScores) return null;
    
    return {
      labels: ['Formality', 'Persuasiveness', 'Technicality', 'Empathy', 'Clarity'],
      datasets: [
        {
          label: 'Current Tone',
          data: [
            analysis.toneScores.formality || 0,
            analysis.toneScores.persuasiveness || 0,
            analysis.toneScores.technicality || 0,
            analysis.toneScores.empathy || 0,
            analysis.toneScores.clarity || 0
          ],
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          borderColor: 'rgb(99, 102, 241)',
          pointBackgroundColor: 'rgb(99, 102, 241)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgb(99, 102, 241)'
        },
        {
          label: 'Target Tone',
          data: [
            selectedTone === 'formal' ? 90 : 30,
            selectedTone === 'persuasive' ? 90 : 30,
            selectedTone === 'technical' ? 90 : 30,
            selectedTone === 'empathetic' ? 90 : 30,
            80
          ],
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderColor: 'rgb(16, 185, 129)',
          pointBackgroundColor: 'rgb(16, 185, 129)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgb(16, 185, 129)'
        }
      ]
    };
  };

  const getChartOptions = () => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: {
            display: true,
            color: theme.palette.divider
          },
          grid: {
            color: theme.palette.divider
          },
          pointLabels: {
            font: {
              size: 12,
              weight: 'bold'
            },
            color: theme.palette.text.primary
          },
          ticks: {
            display: false,
            suggestedMin: 0,
            suggestedMax: 100
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: theme.palette.text.primary,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: theme.palette.background.paper,
          titleColor: theme.palette.text.primary,
          bodyColor: theme.palette.text.primary,
          borderColor: theme.palette.divider,
          borderWidth: 1,
          padding: 12,
          displayColors: true
        }
      }
    };
  };

  if (!analysis) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <PsychologyAlt sx={{ fontSize: 48, color: theme.palette.text.secondary, mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No tone analysis available. Generate a proposal or paste content to analyze.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', mb: 2 }}>
                <Psychology sx={{ mr: 1 }} /> Tone Analysis Results
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>Primary Tone:</strong> {analysis.primaryTone.charAt(0).toUpperCase() + analysis.primaryTone.slice(1)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {analysis.explanation}
                </Typography>
                
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>Confidence:</strong> {analysis.confidence.toFixed(1)}%
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={analysis.confidence} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    bgcolor: 'divider',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: analysis.confidence > 80 ? theme.palette.success.main : 
                              analysis.confidence > 60 ? theme.palette.warning.main : theme.palette.error.main
                    }
                  }} 
                />
              </Box>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>Detected Keywords:</strong>
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {analysis.keywords.map((keyword, index) => (
                    <Chip 
                      key={index} 
                      label={keyword} 
                      size="small" 
                      sx={{ 
                        bgcolor: toneConfig[analysis.primaryTone].color + '20',
                        color: toneConfig[analysis.primaryTone].color,
                        fontWeight: 500
                      }} 
                    />
                  ))}
                </Box>
              </Box>
              
              {analysis.improvementSuggestions && analysis.improvementSuggestions.length > 0 && (
                <Box>
                  <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
                    Improvement Suggestions:
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {analysis.improvementSuggestions.map((suggestion, index) => (
                      <li key={index} style={{ marginBottom: 4 }}>
                        <Typography variant="body2">{suggestion}</Typography>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Tone Alignment Score
              </Typography>
              
              {analysis.alignmentScore ? (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" sx={{ 
                    fontWeight: 700, 
                    color: analysis.alignmentScore > 80 ? theme.palette.success.main : 
                           analysis.alignmentScore > 60 ? theme.palette.warning.main : theme.palette.error.main,
                    mb: 1
                  }}>
                    {analysis.alignmentScore}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Alignment with funder's preferred tone
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={analysis.alignmentScore} 
                    sx={{ 
                      height: 8, 
                      borderRadius: 4,
                      mt: 2,
                      bgcolor: 'divider',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: analysis.alignmentScore > 80 ? theme.palette.success.main : 
                                analysis.alignmentScore > 60 ? theme.palette.warning.main : theme.palette.error.main
                      }
                    }} 
                  />
                </Box>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  No target tone specified for alignment scoring
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Tone Comparison Radar
              </Typography>
              <Box sx={{ height: 300 }}>
                <Radar 
                  data={getChartData()} 
                  options={getChartOptions()} 
                />
              </Box>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Adjust Target Tone
              </Typography>
              
              <Grid container spacing={2}>
                {Object.entries(toneConfig).map(([tone, config]) => (
                  <Grid item xs={6} sm={3} key={tone}>
                    <Tooltip title={config.description} placement="top">
                      <Card 
                        sx={{ 
                          cursor: 'pointer',
                          border: selectedTone === tone ? `2px solid ${config.color}` : `1px solid ${theme.palette.divider}`,
                          bgcolor: selectedTone === tone ? `${config.color}10` : 'background.paper',
                          transition: 'all 0.2s ease-in-out',
                          '&:hover': {
                            transform: 'scale(1.02)',
                            boxShadow: theme.shadows[2]
                          }
                        }}
                        onClick={() => handleToneChange(tone)}
                      >
                        <CardContent sx={{ p: 2, textAlign: 'center' }}>
                          <Box sx={{ 
                            width: 48, 
                            height: 48, 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            margin: '0 auto',
                            bgcolor: `${config.color}20`,
                            mb: 1
                          }}>
                            {tone === 'formal' && <Psychology />}
                            {tone === 'persuasive' && <TrendingUp />}
                            {tone === 'technical' && <PsychologyAlt />}
                            {tone === 'empathetic' && <TrendingDown />}
                          </Box>
                          <Typography variant="body2" fontWeight={600}>
                            {tone.charAt(0).toUpperCase() + tone.slice(1)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Tooltip>
                  </Grid>
                ))}
              </Grid>
              
              <Box sx={{ mt: 3 }}>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>Target Tone:</strong> {selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {toneConfig[selectedTone].description}
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <button
                    onClick={improveContent}
                    disabled={improvedContent}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    <AutoAwesome sx={{ mr: 1 }} />
                    {improvedContent ? 'Content Improved' : 'Improve Content'}
                  </button>
                  {improvedContent && (
                    <button
                      onClick={() => {
                        if (window.confirm('Apply improved content to proposal?')) {
                          // In a real app, this would update the proposal content
                          console.log('Applying improved content:', improvedContent);
                        }
                      }}
                      className="btn btn-outline"
                      style={{ flex: 1 }}
                    >
                      Apply Changes
                    </button>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {improvedContent && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Improved Content ({selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)} Tone)
            </Typography>
            <Box sx={{ 
              bgcolor: 'background.paper', 
              p: 2, 
              borderRadius: 1, 
              border: `1px solid ${theme.palette.divider}`,
              maxHeight: 300,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '14px'
            }}>
              {improvedContent}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}