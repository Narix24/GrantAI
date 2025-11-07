// frontend/src/components/proposal/ProposalBuilder.jsx
import { useState, useEffect, useRef } from 'react';
import { Box, Button, TextField, Select, MenuItem, FormControl, InputLabel, Typography, Paper, Tabs, Tab, CircularProgress, Alert } from '@mui/material';
import { Mic, PlayArrow, Stop, Send, Save, AutoAwesome } from '@mui/icons-material';
import ToneAnalyzer from './ToneAnalyzer';
import VoicePlayback from './VoicePlayback';
import { useAuth } from '../../context/AuthContext';

export default function ProposalBuilder() {
  const [tabValue, setTabValue] = useState(0);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('en');
  const [tone, setTone] = useState('formal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [toneAnalysis, setToneAnalysis] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const { user } = useAuth();

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleGenerate = async () => {
    if (!user) {
      setError('Please log in to generate proposals');
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Get opportunity data from context or API
      const opportunity = {
        id: 'opp_123',
        title: 'Sample Research Grant',
        description: 'Funding for innovative research projects',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        amount: 50000,
        currency: 'USD'
      };
      
      const missionStatement = 'Advancing scientific research for societal benefit';
      const organization = {
        name: 'Research Institute',
        mission: missionStatement,
        pastGrants: ['NSF Grant #12345', 'Horizon Europe Project']
      };
      
      const response = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          opportunity,
          missionStatement,
          organization,
          language,
          tone
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }
      
      const result = await response.json();
      setContent(`# Proposal for ${opportunity.title}\n\nGenerating content... (Job ID: ${result.proposalId})`);
      setSuccess('Proposal generation started! Check your dashboard for updates.');
      
      // Poll for completion
      pollForCompletion(result.proposalId);
    } catch (err) {
      setError(err.message || 'Failed to generate proposal');
      console.error('Generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const pollForCompletion = async (proposalId) => {
    setIsLoading(true);
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/proposals/${proposalId}/status`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) {
          throw new Error('Status check failed');
        }
        
        const status = await response.json();
        
        if (status.completed) {
          setContent(status.content);
          setIsLoading(false);
          setSuccess('Proposal generated successfully!');
          
          // Analyze tone automatically
          analyzeTone(status.content);
        } else {
          setTimeout(checkStatus, 2000);
        }
      } catch (err) {
        setError('Status check failed');
        setIsLoading(false);
      }
    };
    
    setTimeout(checkStatus, 2000);
  };

  const analyzeTone = async (text) => {
    try {
      const response = await fetch('/api/proposals/analyze-tone', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ content: text, language })
      });
      
      if (!response.ok) {
        throw new Error('Tone analysis failed');
      }
      
      const analysis = await response.json();
      setToneAnalysis(analysis);
    } catch (err) {
      console.warn('Tone analysis failed:', err);
    }
  };

  const handleSubmit = async () => {
    if (!recipient) {
      setError('Please enter a recipient email address');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/proposals/submit', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          content, 
          recipient, 
          language 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Submission failed');
      }
      
      const result = await response.json();
      setSuccess(`Proposal submitted successfully! Email ID: ${result.messageId}`);
      setRecipient('');
    } catch (err) {
      setError(err.message || 'Failed to submit proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Convert to text using Web Speech API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // In a real app, send to server for transcription
        // For demo, just append placeholder text
        setContent(prev => prev + '\n\n[Voice transcription would appear here]');
        setIsRecording(false);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      setError('Microphone access denied or unavailable');
      console.error('Recording error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch('/api/proposals/save', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title, content, language, tone })
      });
      
      if (!response.ok) {
        throw new Error('Save failed');
      }
      
      setSuccess('Proposal saved successfully!');
    } catch (err) {
      setError('Failed to save proposal');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        Proposal Builder
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
      
      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Proposal Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isGenerating || isLoading}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Language</InputLabel>
              <Select
                value={language}
                label="Language"
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isGenerating || isLoading}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="de">German</MenuItem>
                <MenuItem value="es">Spanish</MenuItem>
                <MenuItem value="fr">French</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Tone</InputLabel>
              <Select
                value={tone}
                label="Tone"
                onChange={(e) => setTone(e.target.value)}
                disabled={isGenerating || isLoading}
              >
                <MenuItem value="formal">Formal</MenuItem>
                <MenuItem value="persuasive">Persuasive</MenuItem>
                <MenuItem value="technical">Technical</MenuItem>
                <MenuItem value="empathetic">Empathetic</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>
      
      <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 2 }}>
        <Tab label="Editor" icon={<AutoAwesome />} />
        <Tab label="Tone Analysis" icon={<TrendingUp />} />
        <Tab label="Voice Playback" icon={<PlayArrow />} />
      </Tabs>
      
      {tabValue === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Box>
              <Button 
                variant="contained" 
                startIcon={<AutoAwesome />} 
                onClick={handleGenerate}
                disabled={isGenerating || isLoading}
                sx={{ mr: 1 }}
              >
                {isGenerating ? <CircularProgress size={24} /> : 'Generate Proposal'}
              </Button>
              <Button 
                variant="outlined" 
                startIcon={<Save />} 
                onClick={handleSave}
                disabled={isLoading}
                sx={{ mr: 1 }}
              >
                Save Draft
              </Button>
              <Button
                variant={isRecording ? "contained" : "outlined"}
                startIcon={isRecording ? <Stop /> : <Mic />}
                onClick={isRecording ? stopRecording : startRecording}
                color={isRecording ? "error" : "primary"}
                disabled={isGenerating || isLoading}
              >
                {isRecording ? 'Stop Recording' : 'Record Voice'}
              </Button>
            </Box>
            <Box>
              <TextField
                label="Recipient Email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={isSubmitting}
                sx={{ width: 250, mr: 1 }}
              />
              <Button 
                variant="contained" 
                startIcon={<Send />} 
                onClick={handleSubmit}
                disabled={isSubmitting || !content || !recipient}
              >
                {isSubmitting ? <CircularProgress size={24} /> : 'Submit Proposal'}
              </Button>
            </Box>
          </Box>
          
          <TextField
            fullWidth
            multiline
            rows={20}
            variant="outlined"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start typing your proposal here, or click 'Generate Proposal' for AI assistance..."
            disabled={isGenerating || isLoading}
            sx={{ 
              fontFamily: 'monospace',
              fontSize: '16px',
              '& .MuiInputBase-input': {
                lineHeight: 1.5
              }
            }}
          />
        </Box>
      )}
      
      {tabValue === 1 && toneAnalysis && (
        <ToneAnalyzer analysis={toneAnalysis} />
      )}
      
      {tabValue === 2 && content && (
        <VoicePlayback content={content} language={language} />
      )}
    </Box>
  );
}