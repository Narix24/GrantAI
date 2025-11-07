import { useState, useEffect, useRef } from 'react';
import { Box, Button, Slider, Typography, Card, CardContent, useTheme, IconButton, LinearProgress } from '@mui/material';
import { PlayArrow, Pause, Stop, VolumeUp, VolumeOff, Download, Speed, Settings } from '@mui/icons-material';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

export default function VoicePlayback({ content, language = 'en', proposalId }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize WaveSurfer
    wavesurferRef.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: theme.palette.primary.main + '80',
      progressColor: theme.palette.primary.main,
      cursorColor: theme.palette.primary.main,
      barWidth: 3,
      barRadius: 3,
      barGap: 2,
      cursorWidth: 1,
      height: 80,
      responsive: true,
      plugins: [
        RegionsPlugin.create({
          regions: [],
          dragSelection: {
            slop: 5
          }
        })
      ]
    });

    // Load audio
    loadAudio();

    return () => {
      wavesurferRef.current.destroy();
    };
  }, [language, proposalId]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    const subscriptions = [
      ws.on('play', () => setIsPlaying(true)),
      ws.on('pause', () => setIsPlaying(false)),
      ws.on('timeupdate', (time) => setCurrentTime(time)),
      ws.on('ready', (duration) => {
        setDuration(duration);
        setIsLoading(false);
        
        // Add sentence regions
        addSentenceRegions();
      }),
      ws.on('error', (err) => {
        setError('Audio playback failed: ' + err.message);
        setIsLoading(false);
      }),
      ws.on('region-click', (region) => {
        setSelectedRegion(region);
        ws.play(region.start);
      }),
      ws.on('region-update-end', (region) => {
        setSelectedRegion(region);
      })
    ];

    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, [wavesurferRef.current]);

  const loadAudio = async () => {
    try {
      // Get audio URL from backend
      const response = await fetch(`/api/proposals/${proposalId}/voice`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get audio URL');
      }
      
      const data = await response.json();
      setAudioUrl(data.voiceUrl);
      
      // Load audio into WaveSurfer
      wavesurferRef.current.load(data.voiceUrl);
    } catch (err) {
      setError('Failed to load audio: ' + err.message);
      setIsLoading(false);
      
      // Fallback to text-to-speech synthesis
      synthesizeSpeech();
    }
  };

  const synthesizeSpeech = async () => {
    if (!('speechSynthesis' in window)) {
      setError('Text-to-speech not supported in your browser');
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(content.substring(0, 5000)); // Limit to 5000 chars
    
    // Set language and voice
    const voices = window.speechSynthesis.getVoices();
    const targetVoice = voices.find(voice => 
      voice.lang.startsWith(language) && voice.localService
    ) || voices[0];
    
    utterance.voice = targetVoice;
    utterance.rate = playbackRate;
    utterance.volume = volume;
    
    // Create audio context for visualization
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    // This is a simplified approach - in production, we'd use Web Audio API for proper visualization
    setIsLoading(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const addSentenceRegions = () => {
    if (!wavesurferRef.current) return;
    
    // Simple sentence detection
    const sentences = content.split(/[.!?]\s+/).filter(s => s.length > 10);
    const totalTime = wavesurferRef.current.getDuration();
    const sentenceDuration = totalTime / sentences.length;
    
    const newRegions = sentences.map((sentence, index) => ({
      start: index * sentenceDuration,
      end: (index + 1) * sentenceDuration,
      content: sentence.substring(0, 50) + '...',
      color: index % 2 === 0 ? theme.palette.primary.main + '20' : theme.palette.secondary.main + '20'
    }));
    
    setRegions(newRegions);
    
    // Add regions to WaveSurfer
    const wsRegions = wavesurferRef.current.registerPlugin(RegionsPlugin.create());
    newRegions.forEach(region => {
      wsRegions.addRegion({
        start: region.start,
        end: region.end,
        content: region.content,
        color: region.color
      });
    });
  };

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const stop = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.stop();
    }
  };

  const handleVolumeChange = (event, newValue) => {
    setVolume(newValue);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(newValue);
    }
  };

  const handleRateChange = (event, newValue) => {
    setPlaybackRate(newValue);
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(newValue);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const downloadAudio = async () => {
    if (!audioUrl) return;
    
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal_${proposalId}_${language}.mp3`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (err) {
      setError('Download failed: ' + err.message);
    }
  };

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
        <Button 
          variant="contained" 
          onClick={loadAudio}
          startIcon={<Refresh />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        Voice Playback
      </Typography>
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box ref={containerRef} sx={{ width: '100%', mb: 2 }} />
          
          {isLoading && (
            <Box sx={{ width: '100%', mb: 2 }}>
              <LinearProgress />
            </Box>
          )}
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <IconButton onClick={togglePlay} disabled={isLoading}>
              {isPlaying ? <Pause /> : <PlayArrow />}
            </IconButton>
            <IconButton onClick={stop} disabled={isLoading}>
              <Stop />
            </IconButton>
            <Box sx={{ flex: 1, mx: 2 }}>
              <Slider
                value={currentTime}
                max={duration}
                onChange={(_, newValue) => {
                  if (wavesurferRef.current) {
                    wavesurferRef.current.seekTo(newValue / duration);
                    setCurrentTime(newValue);
                  }
                }}
                disabled={isLoading}
              />
            </Box>
            <Typography variant="body2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </Typography>
          </Box>
          
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <VolumeUp />
                <Slider
                  value={volume}
                  onChange={handleVolumeChange}
                  min={0}
                  max={1}
                  step={0.1}
                  disabled={isLoading}
                />
                {volume === 0 && <VolumeOff sx={{ color: theme.palette.text.secondary }} />}
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Speed />
                <Slider
                  value={playbackRate}
                  onChange={handleRateChange}
                  min={0.5}
                  max={2}
                  step={0.1}
                  disabled={isLoading}
                />
                <Typography variant="body2">{playbackRate.toFixed(1)}x</Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Sentence Regions
              </Typography>
              
              {regions.length === 0 ? (
                <Typography color="text.secondary">
                  No sentence regions detected. Play the audio to see sentence breakdown.
                </Typography>
              ) : (
                <Box sx={{ 
                  maxHeight: 300, 
                  overflow: 'auto',
                  '& .region-item': {
                    p: 1.5,
                    mb: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      transform: 'translateX(4px)',
                      boxShadow: theme.shadows[1]
                    }
                  },
                  '& .region-item.selected': {
                    bgcolor: theme.palette.primary.main + '10',
                    borderLeft: `3px solid ${theme.palette.primary.main}`
                  }
                }}>
                  {regions.map((region, index) => (
                    <Box
                      key={index}
                      className={`region-item ${selectedRegion?.start === region.start ? 'selected' : ''}`}
                      onClick={() => {
                        if (wavesurferRef.current) {
                          wavesurferRef.current.seekTo(region.start / duration);
                          wavesurferRef.current.play();
                        }
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {index + 1}. {region.content}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(region.start)} - {formatTime(region.end)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center' }}>
                <Settings sx={{ mr: 1 }} /> Playback Settings
              </Typography>
              
              <Box sx={{ mb: 3 }}>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  Language: <strong>{language.toUpperCase()}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Voice optimized for {language} content
                </Typography>
              </Box>
              
              <Button
                fullWidth
                variant="contained"
                onClick={downloadAudio}
                disabled={!audioUrl || isLoading}
                startIcon={<Download />}
                sx={{ mb: 2 }}
              >
                Download Audio
              </Button>
              
              <Button
                fullWidth
                variant="outlined"
                onClick={() => {
                  // In a real app, this would open voice settings modal
                  alert('Voice selection and customization coming soon!');
                }}
                startIcon={<Tune />}
              >
                Customize Voice
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {selectedRegion && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Selected Region: {selectedRegion.content.substring(0, 50)}...
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={() => {
                  if (wavesurferRef.current) {
                    wavesurferRef.current.seekTo(selectedRegion.start / duration);
                    wavesurferRef.current.play();
                  }
                }}
              >
                Play Region
              </Button>
              <Button
                variant="outlined"
                startIcon={<Repeat />}
                onClick={() => {
                  // In a real app, this would repeat the region
                  alert('Repeat functionality coming soon!');
                }}
              >
                Repeat 3x
              </Button>
              <Button
                variant="outlined"
                startIcon={<Mic />}
                onClick={() => {
                  // In a real app, this would enable recording over the region
                  alert('Record over region functionality coming soon!');
                }}
              >
                Record Over
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}