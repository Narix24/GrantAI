import { createAudioFile } from '@google/text-to-speech';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { dbRouter } from '../services/dbRouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class VoicePlaybackAgent {
  constructor() {
    this.voices = {
      en: 'en-US-Standard-C', // Male
      es: 'es-ES-Standard-B',
      fr: 'fr-FR-Standard-C',
      de: 'de-DE-Standard-B',
      it: 'it-IT-Standard-C',
      nl: 'nl-NL-Standard-B',
      pl: 'pl-PL-Standard-B',
      pt: 'pt-PT-Standard-B',
      ro: 'ro-RO-Standard-A',
      ru: 'ru-RU-Standard-B'
    };
    this.audioDir = path.join(__dirname, '../../public/audio');
  }

  async execute(payload) {
    const { content, language = 'en', proposalId } = payload;
    
    logger.info(`🔊 Generating audio for ${language} content (proposal: ${proposalId})`);
    
    try {
      // 📁 Ensure audio directory exists
      await fs.mkdir(this.audioDir, { recursive: true });
      
      // 🎙️ Generate audio file
      const audioPath = await this.generateAudio(content, language, proposalId);
      
      // 🗃️ Update proposal with audio URL
      await this.updateProposal(proposalId, audioPath);
      
      logger.info(`✅ Audio generated successfully: ${audioPath}`);
      return audioPath;
    } catch (error) {
      logger.error(`❌ Audio generation failed for ${proposalId}`, error);
      
      // Trigger recovery
      import('../orchestration/recoveryOrchestrator.js').then(({ recoveryOrchestrator }) => {
        recoveryOrchestrator.triggerRecovery(error, { 
          service: 'voice_playback', 
          proposalId,
          language
        });
      });
      
      throw error;
    }
  }

  async generateAudio(text, language, proposalId) {
    // 📝 Clean text for TTS
    const cleanedText = this.cleanTextForTTS(text);
    
    // ⚙️ Configure TTS request
    const request = {
      input: { text: cleanedText },
      voice: { 
        languageCode: language,
        name: this.voices[language] || 'en-US-Standard-C'
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: 0.95,
        pitch: -2.0
      }
    };
    
    // 🔑 Use appropriate TTS service based on environment
    let audioContent;
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Google Cloud TTS
      audioContent = await this.googleTTS(request);
    } else {
      // Fallback to offline TTS (e.g., eSpeak)
      audioContent = await this.fallbackTTS(cleanedText, language);
    }
    
    // 💾 Save audio file
    const fileName = `${proposalId}_${Date.now()}.mp3`;
    const filePath = path.join(this.audioDir, fileName);
    await fs.writeFile(filePath, audioContent);
    
    return `/audio/${fileName}`;
  }

  cleanTextForTTS(text) {
    // Remove markdown formatting
    return text
      .replace(/[#*_`~[\]()>]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async googleTTS(request) {
    const [response] = await createAudioFile(request);
    return response.audioContent;
  }

  async fallbackTTS(text, language) {
    logger.warn('⚠️ Using fallback TTS engine (offline mode)');
    
    // Simple fallback using system TTS (e.g., for development)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const tempFile = `/tmp/tts_${Date.now()}.wav`;
    const outputFile = `/tmp/tts_${Date.now()}.mp3`;
    
    try {
      // Use espeak for text-to-speech
      await execAsync(`espeak -v ${language} -w ${tempFile} "${text.substring(0, 500)}"`); // Limit to 500 chars
      
      // Convert to MP3
      await execAsync(`ffmpeg -i ${tempFile} -codec:a libmp3lame -qscale:a 2 ${outputFile}`);
      
      const audioBuffer = await fs.readFile(outputFile);
      await Promise.all([
        fs.unlink(tempFile).catch(() => {}),
        fs.unlink(outputFile).catch(() => {})
      ]);
      
      return audioBuffer;
    } catch (error) {
      logger.error('❌ Fallback TTS failed', error);
      throw new Error('Audio generation unavailable in offline mode');
    }
  }

  async updateProposal(proposalId, audioUrl) {
    const db = dbRouter.getAdapter();
    
    try {
      if (db.model) {
        // MongoDB
        await db.model('Proposal').updateOne(
          { id: proposalId },
          { $set: { voiceUrl: audioUrl, updatedAt: new Date() } }
        );
      } else {
        // SQLite
        await db.adapters.sqlite.run(`
          UPDATE proposals 
          SET voiceUrl = ?, updatedAt = ?
          WHERE id = ?
        `, [audioUrl, new Date().toISOString(), proposalId]);
      }
    } catch (error) {
      logger.error(`❌ Failed to update proposal ${proposalId} with audio URL`, error);
      throw error;
    }
  }
}