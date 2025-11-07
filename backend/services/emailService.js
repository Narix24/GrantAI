import nodemailer from 'nodemailer';
import { dkimSign } from 'dkim-signer';
import { logger } from '../utils/logger.js';
import { formatterService } from './formatterService.js';
import { i18nService } from './i18nService.js';

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
    this.dkimConfig = {
      domainName: process.env.DKIM_DOMAIN,
      keySelector: process.env.DKIM_SELECTOR,
      privateKey: process.env.DKIM_PRIVATE_KEY?.replace(/\\n/g, '\n')
    };
  }

  createTransporter() {
    // 🛡️ Secure SMTP configuration
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      maxConnections: 5,
      maxMessages: 100
    });
  }

  async sendProposal(proposal, recipient, language = 'en') {
    const htmlContent = await formatterService.markdownToHtml(proposal.content);
    const textContent = proposal.content.replace(/[#*_`]/g, '');
    
    // 🌍 Localize subject line
    const subject = await i18nService.translate('PROPOSAL_SUBMISSION', language, {
      opportunity: proposal.opportunityName
    });

    const mailOptions = {
      from: `"Grant-AI" <${process.env.EMAIL_FROM}>`,
      to: recipient,
      subject,
      html: this.enhanceEmailTemplate(htmlContent, proposal, language),
      text: textContent,
      attachments: [
        {
          filename: `${proposal.title.replace(/\s+/g, '_')}.pdf`,
          content: await this.generatePDF(proposal),
          contentType: 'application/pdf'
        }
      ],
      headers: {
        'X-Priority': '1',
        'X-GrantAI-Version': process.env.npm_package_version,
        'List-Unsubscribe': `<${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(recipient)}>`
      }
    };

    // 📧 Send with DKIM signing
    try {
      const info = await this.sendMailWithDKIM(mailOptions);
      logger.info(`✅ Proposal sent to ${recipient}`, { messageId: info.messageId });
      
      // 📊 Track delivery metrics
      this.trackDeliveryMetrics(info, proposal);
      
      return info;
    } catch (error) {
      logger.error(`❌ Failed to send proposal to ${recipient}`, error);
      
      // 🔄 Fallback to backup SMTP server
      if (process.env.BACKUP_SMTP_HOST) {
        logger.info('🔄 Attempting backup SMTP server');
        this.transporter = this.createBackupTransporter();
        return this.sendProposal(proposal, recipient, language);
      }
      
      throw error;
    }
  }

  async sendMailWithDKIM(mailOptions) {
    if (this.dkimConfig.privateKey) {
      const dkimHeader = dkimSign(mailOptions, this.dkimConfig);
      mailOptions.headers = {
        ...mailOptions.headers,
        'DKIM-Signature': dkimHeader
      };
    }
    return this.transporter.sendMail(mailOptions);
  }

  enhanceEmailTemplate(htmlContent, proposal, language) {
    const logoUrl = `${process.env.APP_URL}/logo.png`;
    const unsubscribeUrl = `${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(proposal.submitterEmail)}`;
    
    return `
    <!DOCTYPE html>
    <html lang="${language}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .container { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px; text-align: center; }
        .header img { max-height: 48px; }
        .content { padding: 32px; background: #ffffff; }
        .footer { background: #f1f5f9; padding: 24px; text-align: center; font-size: 14px; color: #64748b; }
        .proposal-meta { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
        .status-badge { padding: 4px 12px; border-radius: 9999px; font-weight: 600; }
        .status-submitted { background: #dcfce7; color: #166534; }
        @media (prefers-color-scheme: dark) {
          body { background: #0f172a; color: #e2e8f0; }
          .content { background: #1e293b; }
          .footer { background: #0f172a; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="${logoUrl}" alt="Grant-AI Logo">
        </div>
        <div class="content">
          <div class="proposal-meta">
            <div>
              <strong>${proposal.opportunityName}</strong><br>
              Deadline: ${new Date(proposal.deadline).toLocaleDateString(language)}
            </div>
            <span class="status-badge status-submitted">SUBMITTED</span>
          </div>
          ${htmlContent}
        </div>
        <div class="footer">
          <p>${i18nService.translate('EMAIL_FOOTER', language)}</p>
          <p>
            <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">${i18nService.translate('UNSUBSCRIBE', language)}</a> | 
            <a href="${process.env.APP_URL}/dashboard" style="color: #64748b; text-decoration: underline;">${i18nService.translate('VIEW_DASHBOARD', language)}</a>
          </p>
          <p style="margin-top: 16px; font-size: 12px; color: #94a3b8;">
            ${i18nService.translate('CONFIDENTIALITY_NOTICE', language)}
          </p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  async generatePDF(proposal) {
    // 🖨️ PDF generation with Puppeteer
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });
    
    const page = await browser.newPage();
    await page.setContent(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            .header { text-align: center; margin-bottom: 30px; }
            .proposal-meta { margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px; }
            .content { line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${proposal.title}</h1>
            <p>${proposal.organization}</p>
          </div>
          <div class="proposal-meta">
            <strong>${proposal.opportunityName}</strong><br>
            Deadline: ${new Date(proposal.deadline).toLocaleDateString()}
          </div>
          <div class="content">
            ${proposal.content.replace(/\n/g, '<br>')}
          </div>
        </body>
      </html>
    `, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({ format: 'A4' });
    await browser.close();
    return pdf;
  }

  async trackDeliveryMetrics(info, proposal) {
    // 📈 Integrate with metrics service
    const { metrics } = await import('../utils/metrics.js');
    
    metrics.increment('emails_sent', 1, {
      provider: info.envelope?.from?.includes('gmail') ? 'gmail' : 'smtp',
      proposal_id: proposal.id,
      language: proposal.language
    });
    
    metrics.timing('email_delivery_time', info.responseTime, {
      success: true
    });
  }

  createBackupTransporter() {
    return nodemailer.createTransport({
      host: process.env.BACKUP_SMTP_HOST,
      port: parseInt(process.env.BACKUP_SMTP_PORT) || 587,
      secure: process.env.BACKUP_SMTP_SECURE === 'true',
      auth: {
        user: process.env.BACKUP_SMTP_USER,
        pass: process.env.BACKUP_SMTP_PASSWORD
      }
    });
  }
}

export const emailService = new EmailService();