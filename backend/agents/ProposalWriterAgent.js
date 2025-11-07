import { aiService } from '../services/aiService.js';
import { chromaStore } from '../services/vectorStore/chroma.js';
import { formatterService } from '../services/formatterService.js';
import { logger } from '../utils/logger.js';

export class ProposalWriterAgent {
  async execute(payload) {
    const { opportunity, missionStatement, organization, language, tone = 'formal' } = payload;
    
    logger.info(`✍️ Generating proposal for ${opportunity.title} in ${language}`);
    
    // 🧠 Retrieve relevant context from vector store
    const context = await this.getContext(opportunity, organization);
    
    // 🌍 Prepare localized prompt
    const prompt = await this.buildPrompt({
      opportunity,
      missionStatement,
      organization,
      context,
      tone,
      language
    });
    
    // 🤖 Generate proposal content
    const content = await aiService.generate({
      prompt,
      context: context.documents,
      language,
      provider: 'auto'
    });
    
    // 📝 Format content with markdown enhancements
    const formattedContent = await formatterService.enhanceProposal(content, opportunity);
    
    // 🗣️ Generate voice narration (async)
    this.generateVoiceNarration(formattedContent, language, payload.proposalId);
    
    return {
      content: formattedContent,
      metadata: {
        sources: context.sources,
        wordCount: formattedContent.split(/\s+/).length,
        toneAnalysis: await this.analyzeTone(content, language),
        generatedAt: new Date().toISOString()
      }
    };
  }
  
  async getContext(opportunity, organization) {
    // 🔍 Query vector store for similar grants
    const grantContext = await chromaStore.querySimilar(
      `${opportunity.title} ${opportunity.description} ${opportunity.categories.join(' ')}`,
      3,
      { type: 'grant_opportunity' }
    );
    
    // 🔍 Query for organizational context
    const orgContext = await chromaStore.querySimilar(
      `${organization.name} ${organization.mission} ${organization.pastGrants.join(' ')}`,
      2,
      { type: 'organization_profile' }
    );
    
    return {
      documents: [
        ...grantContext.map(c => c.text),
        ...orgContext.map(c => c.text),
        `Current date: ${new Date().toISOString().split('T')[0]}`
      ],
      sources: [
        ...grantContext.map(c => ({ id: c.id, type: 'grant' })),
        ...orgContext.map(c => ({ id: c.id, type: 'organization' }))
      ]
    };
  }
  
  async buildPrompt({ opportunity, missionStatement, organization, context, tone, language }) {
    return `
    You are an expert grant writer with 15 years of experience in securing funding for organizations like ${organization.name}. 
    Your task is to write a compelling proposal for the following opportunity:
    
    **Opportunity Details**
    Title: ${opportunity.title}
    Organization: ${opportunity.organization}
    Deadline: ${new Date(opportunity.deadline).toLocaleDateString(language)}
    Amount: ${opportunity.amount ? `${opportunity.amount.toLocaleString()} ${opportunity.currency}` : 'Not specified'}
    Description: ${opportunity.description}
    
    **Our Organization**
    Name: ${organization.name}
    Mission: ${missionStatement}
    Past Successes: ${organization.pastGrants.join('; ')}
    
    **Writing Requirements**
    - Language: ${language}
    - Tone: ${tone} (match the funder's preferred communication style)
    - Length: Approximately 1500 words
    - Structure: Include sections for problem statement, methodology, budget justification, and impact assessment
    - Special requirements: ${opportunity.specialRequirements || 'None specified'}
    
    **Relevant Context from Knowledge Base**
    ${context.documents.map(doc => `- ${doc}`).join('\n')}
    
    IMPORTANT: 
    1. Do not include any markdown formatting in the response
    2. Focus on measurable outcomes and alignment with funder priorities
    3. Include specific budget justifications for major line items
    4. Address potential concerns about implementation challenges
    5. Maintain a persuasive but professional tone throughout
    
    Begin the proposal with a strong executive summary that captures attention immediately.
    `;
  }
  
  async analyzeTone(content, language) {
    // 🎯 Offload to dedicated ToneAnalyzerAgent
    const { ToneAnalyzerAgent } = await import('./ToneAnalyzerAgent.js');
    return new ToneAnalyzerAgent().execute({ content, language });
  }
  
  async generateVoiceNarration(content, language, proposalId) {
    try {
      const { VoicePlaybackAgent } = await import('./VoicePlaybackAgent.js');
      await new VoicePlaybackAgent().execute({ 
        content: content.substring(0, 5000), // First 5000 characters
        language,
        proposalId 
      });
    } catch (error) {
      logger.warn(`🔊 Voice narration generation failed for ${proposalId}`, error);
    }
  }
}