const { VoicePlaybackAgent } = require('../../../backend/agents/VoicePlaybackAgent');
const { dbRouter } = require('../../../backend/services/dbRouter');
const fs = require('fs/promises');
const path = require('path');

jest.mock('fs/promises');
jest.mock('../../../backend/services/dbRouter');

describe('VoicePlaybackAgent Integration', () => {
  let agent;
  const mockAudioContent = Buffer.from('mock-audio-data');
  
  beforeEach(() => {
    agent = new VoicePlaybackAgent();
    jest.clearAllMocks();
    
    // Mock file system operations
    fs.mkdir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.readFile.mockResolvedValue(mockAudioContent);
    fs.unlink.mockResolvedValue();
    
    // Mock database
    dbRouter.getAdapter.mockReturnValue({
      model: jest.fn().mockReturnValue({
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
      }),
      adapters: {
        sqlite: {
          run: jest.fn().mockResolvedValue({ changes: 1 })
        }
      }
    });
  });

  describe('Audio Generation', () => {
    test('should generate audio using Google TTS when credentials available', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = 'valid-credentials.json';
      
      // Mock Google TTS
      jest.mock('@google/text-to-speech', () => ({
        createAudioFile: jest.fn().mockResolvedValue([{ audioContent: mockAudioContent }])
      }));
      
      const result = await agent.generateAudio('Test content', 'en', 'test_prop_123');
      
      expect(result).toContain('/audio/test_prop_123');
      expect(fs.writeFile).toHaveBeenCalled();
      expect(require('@google/text-to-speech').createAudioFile).toHaveBeenCalled();
    });

    test('should use fallback TTS when Google credentials not available', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      // Mock child process execution
      const mockExec = jest.fn().mockResolvedValue();
      jest.mock('child_process', () => ({
        exec: mockExec
      }));
      
      const result = await agent.generateAudio('Test content', 'en', 'test_prop_124');
      
      expect(result).toContain('/audio/test_prop_124');
      expect(mockExec).toHaveBeenCalled();
      expect(mockExec.mock.calls.some(call => 
        call[0].includes('espeak') && call[0].includes('ffmpeg')
      )).toBe(true);
    });

    test('should clean text properly for TTS', () => {
      const dirtyText = `
        # Executive **Summary**
        This is a *test* with [markdown](https://example.com) formatting.
        
        Multiple   spaces   and special characters like > < &
      `;
      
      const cleanedText = agent.cleanTextForTTS(dirtyText);
      
      expect(cleanedText).not.toContain('#');
      expect(cleanedText).not.toContain('**');
      expect(cleanedText).not.toContain('*');
      expect(cleanedText).not.toContain('[');
      expect(cleanedText).not.toContain('>');
      
      expect(cleanedText).toContain('Executive Summary');
      expect(cleanedText).toContain('This is a test with markdown formatting');
      expect(cleanedText).toContain('Multiple spaces and special characters like');
    });
  });

  describe('Database Updates', () => {
    test('should update proposal with audio URL in MongoDB', async () => {
      // Execute audio generation
      await agent.execute({
        content: 'Test content',
        language: 'en',
        proposalId: 'mongo_prop_123'
      });
      
      expect(dbRouter.getAdapter().model).toHaveBeenCalledWith('Proposal');
      expect(dbRouter.getAdapter().model().updateOne).toHaveBeenCalledWith(
        { id: 'mongo_prop_123' },
        { 
          $set: { 
            voiceUrl: expect.stringContaining('/audio/mongo_prop_123'),
            updatedAt: expect.any(Date)
          }
        }
      );
    });

    test('should update proposal with audio URL in SQLite', async () => {
      // Mock SQLite adapter
      dbRouter.getAdapter.mockReturnValue({
        adapters: {
          sqlite: {
            run: jest.fn().mockResolvedValue({ changes: 1 })
          }
        }
      });
      
      await agent.execute({
        content: 'Test content',
        language: 'en',
        proposalId: 'sqlite_prop_123'
      });
      
      expect(dbRouter.getAdapter().adapters.sqlite.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE proposals SET voiceUrl'),
        expect.arrayContaining([
          expect.stringContaining('/audio/sqlite_prop_123'),
          expect.any(String),
          'sqlite_prop_123'
        ])
      );
    });
  });

  describe('Error Handling', () => {
    test('should trigger recovery on TTS failure', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = 'valid-credentials.json';
      
      // Mock TTS failure
      jest.mock('@google/text-to-speech', () => ({
        createAudioFile: jest.fn().mockRejectedValue(new Error('TTS service unavailable'))
      }));
      
      const mockRecovery = {
        triggerRecovery: jest.fn()
      };
      
      jest.mock('../../../backend/orchestration/recoveryOrchestrator', () => ({
        recoveryOrchestrator: mockRecovery
      }), { virtual: true });
      
      await expect(agent.execute({
        content: 'Test content',
        language: 'en',
        proposalId: 'fail_prop_123'
      })).rejects.toThrow('TTS service unavailable');
      
      expect(mockRecovery.triggerRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          service: 'voice_playback',
          proposalId: 'fail_prop_123',
          language: 'en'
        })
      );
    });

    test('should handle fallback TTS failures gracefully', async () => {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      // Mock child process failure
      jest.mock('child_process', () => ({
        exec: jest.fn().mockImplementation((command, callback) => {
          callback(new Error('Command failed'), null, null);
        })
      }));
      
      await expect(agent.execute({
        content: 'Test content',
        language: 'en',
        proposalId: 'fallback_fail_123'
      })).rejects.toThrow('Audio generation unavailable in offline mode');
    });
  });

  describe('Multilingual Support', () => {
    test('should use appropriate voice for German content', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = 'valid-credentials.json';
      
      // Mock Google TTS call
      let capturedRequest;
      jest.mock('@google/text-to-speech', () => ({
        createAudioFile: jest.fn().mockImplementation((request) => {
          capturedRequest = request;
          return Promise.resolve([{ audioContent: mockAudioContent }]);
        })
      }));
      
      await agent.execute({
        content: 'Deutscher Inhalt',
        language: 'de',
        proposalId: 'german_prop_123'
      });
      
      expect(capturedRequest.voice).toEqual({
        languageCode: 'de',
        name: 'de-DE-Standard-B' // German voice
      });
    });

    test('should handle unsupported languages with fallback', async () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = 'valid-credentials.json';
      
      await expect(agent.execute({
        content: 'Contenu en chinois',
        language: 'zh', // Unsupported language
        proposalId: 'unsupported_prop_123'
      })).resolves.not.toThrow();
      
      // Should use default English voice
      const capturedRequest = require('@google/text-to-speech').createAudioFile.mock.calls[0][0];
      expect(capturedRequest.voice.name).toBe('en-US-Standard-C');
    });
  });
});