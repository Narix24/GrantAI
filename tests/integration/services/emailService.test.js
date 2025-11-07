const { emailService } = require('../../../backend/services/emailService');
const nodemailer = require('nodemailer');
const { dkimSign } = require('dkim-signer');

jest.mock('nodemailer');
jest.mock('dkim-signer');
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('mock_pdf_content')),
      close: jest.fn()
    }),
    close: jest.fn()
  })
}));

describe('Email Service Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'test@domain.com';
    process.env.SMTP_PASSWORD = 'test_password';
    process.env.EMAIL_FROM = 'grant-ai@test.com';
    process.env.DKIM_DOMAIN = 'test.com';
    process.env.DKIM_SELECTOR = 'grant-ai';
    process.env.DKIM_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nmock_key\n-----END PRIVATE KEY-----';
  });

  describe('Email Sending', () => {
    test('should send proposal email with DKIM signature', async () => {
      // Mock transporter
      const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg_123' });
      nodemailer.createTransport.mockReturnValue({
        sendMail: mockSendMail
      });
      
      // Mock DKIM signing
      dkimSign.mockReturnValue('mock_dkim_signature');
      
      const proposal = {
        id: 'prop_123',
        title: 'Test Proposal',
        content: '# Test Proposal\nThis is a test.',
        language: 'en',
        organization: 'Test Organization',
        opportunityName: 'Test Grant',
        submitterEmail: 'submitter@test.com'
      };
      
      const recipient = 'committee@test.com';
      
      const result = await emailService.sendProposal(proposal, recipient, 'en');
      
      expect(result).toHaveProperty('messageId', 'msg_123');
      
      // Verify email options
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        from: '"Grant-AI" <grant-ai@test.com>',
        to: 'committee@test.com',
        subject: 'Proposal Submission: Test Grant',
        html: expect.any(String),
        text: expect.any(String),
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'Test_Proposal.pdf',
            contentType: 'application/pdf'
          })
        ]),
        headers: expect.objectContaining({
          'DKIM-Signature': 'mock_dkim_signature'
        })
      }));
    });

    test('should handle HTML template generation with localization', async () => {
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg_456' })
      });
      
      const proposal = {
        id: 'prop_456',
        title: 'German Proposal',
        content: '# Deutsche Vorschlag\nDies ist ein Test.',
        language: 'de',
        organization: 'Deutsche Organisation',
        opportunityName: 'Deutsche Stiftung',
        deadline: new Date('2025-12-31'),
        submitterEmail: 'submitter@test.com'
      };
      
      const result = await emailService.sendProposal(proposal, 'committee@test.com', 'de');
      
      // Verify German localization
      expect(result.messageId).toBe('msg_456');
      
      // Get the HTML content from the mock call
      const htmlContent = nodemailer.createTransport().sendMail.mock.calls[0][0].html;
      expect(htmlContent).toContain('Deutsche Vorschlag');
      expect(htmlContent).toContain('Deutsche Stiftung');
      expect(htmlContent).toContain('31.12.2025'); // German date format
      expect(htmlContent).toContain('Vertraulich: Dieser Vorschlag enthält proprietäre Informationen');
    });

    test('should generate PDF attachment successfully', async () => {
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg_pdf' })
      });
      
      const proposal = {
        id: 'prop_pdf',
        title: 'PDF Test Proposal',
        content: '# PDF Test\nThis should be in the PDF.',
        language: 'en',
        organization: 'PDF Org',
        opportunityName: 'PDF Grant',
        deadline: new Date('2025-12-31')
      };
      
      await emailService.sendProposal(proposal, 'test@test.com', 'en');
      
      // Verify PDF generation
      const puppeteer = require('puppeteer');
      expect(puppeteer.launch).toHaveBeenCalled();
      expect(puppeteer.launch().newPage).toHaveBeenCalled();
      expect(puppeteer.launch().newPage().setContent).toHaveBeenCalledWith(expect.any(String));
      expect(puppeteer.launch().newPage().pdf).toHaveBeenCalled();
    });
  });

  describe('Fallback Mechanisms', () => {
    test('should fallback to backup SMTP server on primary failure', async () => {
      // Mock primary SMTP failure
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection failed'))
      });
      
      // Set backup SMTP config
      process.env.BACKUP_SMTP_HOST = 'backup.smtp.test.com';
      process.env.BACKUP_SMTP_PORT = '587';
      process.env.BACKUP_SMTP_USER = 'backup@domain.com';
      process.env.BACKUP_SMTP_PASSWORD = 'backup_password';
      
      // Mock backup transporter
      const mockBackupSendMail = jest.fn().mockResolvedValue({ messageId: 'msg_backup' });
      const mockBackupTransport = {
        sendMail: mockBackupSendMail
      };
      
      // Mock createBackupTransporter method
      emailService.createBackupTransporter = jest.fn().mockReturnValue(mockBackupTransport);
      
      const proposal = {
        id: 'prop_backup',
        title: 'Backup Test',
        content: 'Backup test content',
        language: 'en'
      };
      
      const result = await emailService.sendProposal(proposal, 'backup@test.com', 'en');
      
      expect(result).toHaveProperty('messageId', 'msg_backup');
      expect(emailService.createBackupTransporter).toHaveBeenCalled();
      expect(mockBackupSendMail).toHaveBeenCalled();
      
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting backup SMTP server')
      );
    });

    test('should handle DKIM signing failure gracefully', async () => {
      // Mock DKIM signing failure
      dkimSign.mockImplementation(() => {
        throw new Error('DKIM key invalid');
      });
      
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg_no_dkim' })
      });
      
      const proposal = {
        id: 'prop_no_dkim',
        title: 'No DKIM Test',
        content: 'Content without DKIM',
        language: 'en'
      };
      
      const result = await emailService.sendProposal(proposal, 'test@test.com', 'en');
      
      expect(result).toHaveProperty('messageId', 'msg_no_dkim');
      
      // Verify email was sent without DKIM signature
      const mailOptions = nodemailer.createTransport().sendMail.mock.calls[0][0];
      expect(mailOptions.headers).not.toHaveProperty('DKIM-Signature');
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('DKIM signing failed, sending without DKIM')
      );
    });
  });

  describe('Security Features', () => {
    test('should include unsubscribe link in email footer', async () => {
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg_unsub' })
      });
      
      const proposal = {
        id: 'prop_unsub',
        title: 'Unsubscribe Test',
        content: 'Test content',
        language: 'en',
        submitterEmail: 'submitter@test.com'
      };
      
      await emailService.sendProposal(proposal, 'test@test.com', 'en');
      
      const htmlContent = nodemailer.createTransport().sendMail.mock.calls[0][0].html;
      expect(htmlContent).toContain('unsubscribe?email=submitter%40test.com');
      expect(htmlContent).toContain('List-Unsubscribe');
    });

    test('should sanitize HTML content to prevent XSS', async () => {
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg_sanitized' })
      });
      
      const proposal = {
        id: 'prop_xss',
        title: 'XSS Test',
        content: '# Malicious Content\n<script>alert("xss")</script>',
        language: 'en'
      };
      
      await emailService.sendProposal(proposal, 'test@test.com', 'en');
      
      const htmlContent = nodemailer.createTransport().sendMail.mock.calls[0][0].html;
      // Verify script tag is removed or escaped
      expect(htmlContent).not.toContain('<script>alert("xss")</script>');
      expect(htmlContent).toContain('<script>alert("xss")</script>');
    });
  });

  describe('Metrics Tracking', () => {
    test('should track email delivery metrics', async () => {
      // Mock metrics service
      const mockIncrement = jest.fn();
      const mockTiming = jest.fn();
      
      jest.mock('../../../backend/utils/metrics', () => ({
        metrics: {
          increment: mockIncrement,
          timing: mockTiming
        }
      }), { virtual: true });
      
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'msg_metrics',
          responseTime: 250
        })
      });
      
      const proposal = {
        id: 'prop_metrics',
        title: 'Metrics Test',
        content: 'Test content',
        language: 'en'
      };
      
      await emailService.sendProposal(proposal, 'test@test.com', 'en');
      
      expect(mockIncrement).toHaveBeenCalledWith(
        'emails_sent',
        1,
        expect.objectContaining({
          provider: 'smtp',
          proposal_id: 'prop_metrics',
          language: 'en'
        })
      );
      
      expect(mockTiming).toHaveBeenCalledWith(
        'email_delivery_time',
        250,
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('Error Handling', () => {
    test('should reject with proper error when all SMTP servers fail', async () => {
      // Mock primary SMTP failure
      nodemailer.createTransport.mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(new Error('Primary SMTP failed'))
      });
      
      // Mock backup SMTP failure
      emailService.createBackupTransporter = jest.fn().mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(new Error('Backup SMTP failed'))
      });
      
      const proposal = {
        id: 'prop_fail',
        title: 'Failure Test',
        content: 'This should fail',
        language: 'en'
      };
      
      await expect(emailService.sendProposal(proposal, 'test@test.com', 'en'))
        .rejects
        .toThrow('Backup SMTP failed');
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send proposal'),
        expect.any(Error)
      );
    });
  });
});