// backend/routes/grants.js

import express from 'express';
import { dbRouter } from '../services/dbRouter.js';
import { logger } from '../utils/logger.js';
import authMiddleware from '../routes/auth.js';

const router = express.Router();

// 🔍 Discover new grants
router.post('/discover', authMiddleware, async (req, res) => {
  try {
    const { sources = ['all'] } = req.body;
    
    // 🕷️ Trigger grant crawling
    import('../orchestration/scraperWorker.js').then(({ registerScraperWorker }) => {
      registerScraperWorker(); // Ensure worker is registered
    });
    
    import('../orchestration/queue.js').then(({ proposalQueue }) => {
      proposalQueue.add('scrape_grants', { sources }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });
    });
    
    res.json({ 
      message: req.__('GRANTS_DISCOVERY_STARTED'),
      jobId: `scrape_${Date.now()}`
    });
  } catch (error) {
    logger.error('Grant discovery failed', error);
    res.status(500).json({ error: req.__('SERVER_ERROR') });
  }
});

// 📋 List available grants
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      deadlineFrom, 
      deadlineTo, 
      amountMin, 
      amountMax,
      language = req.language,
      categories = [] 
    } = req.query;
    
    const db = dbRouter.getAdapter();
    let query = {};
    
    // Apply filters
    if (deadlineFrom) query.deadline = { $gte: new Date(deadlineFrom) };
    if (deadlineTo) {
      query.deadline = query.deadline || {};
      query.deadline.$lte = new Date(deadlineTo);
    }
    if (amountMin || amountMax) {
      query.amount = {};
      if (amountMin) query.amount.$gte = parseFloat(amountMin);
      if (amountMax) query.amount.$lte = parseFloat(amountMax);
    }
    if (categories.length > 0) query.categories = { $in: categories };
    if (language) query.language = language;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let grants, total;
    
    if (db.model) {
      // MongoDB
      [grants, total] = await Promise.all([
        db.model('Grant')
          .find(query)
          .sort({ deadline: 1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        db.model('Grant').countDocuments(query)
      ]);
    } else {
      // SQLite
      const whereClauses = [];
      const params = [];
      
      if (deadlineFrom) {
        whereClauses.push('deadline >= ?');
        params.push(deadlineFrom);
      }
      if (deadlineTo) {
        whereClauses.push('deadline <= ?');
        params.push(deadlineTo);
      }
      if (amountMin) {
        whereClauses.push('amount >= ?');
        params.push(amountMin);
      }
      if (amountMax) {
        whereClauses.push('amount <= ?');
        params.push(amountMax);
      }
      if (categories.length > 0) {
        whereClauses.push(`categories LIKE ?`);
        params.push(`%${categories.join('%')}%`);
      }
      if (language) {
        whereClauses.push('language = ?');
        params.push(language);
      }
      
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      
      grants = await db.adapters.sqlite.all(`
        SELECT * FROM grants
        ${whereClause}
        ORDER BY deadline ASC
        LIMIT ? OFFSET ?
      `.trim(), [...params, parseInt(limit), skip]);
      
      total = (await db.adapters.sqlite.get(`
        SELECT COUNT(*) as count FROM grants
        ${whereClause}
      `.trim(), params)).count;
    }
    
    // 🌐 Translate category names if needed
    if (language !== 'en') {
      const { i18nService } = await import('../services/i18nService.js');
      grants = await Promise.all(grants.map(async grant => {
        if (grant.categories) {
          grant.categories = await Promise.all(
            grant.categories.map(cat => i18nService.translate(cat, language))
          );
        }
        return grant;
      }));
    }
    
    res.json({
      grants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Grant listing failed', error);
    res.status(500).json({ error: req.__('SERVER_ERROR') });
  }
});

// 🔔 Set deadline reminder
router.post('/:grantId/reminders', authMiddleware, async (req, res) => {
  try {
    const { grantId } = req.params;
    const { remindAt } = req.body;
    
    // 📅 Create calendar event
    import('../agents/CalendarSyncAgent.js').then(({ CalendarSyncAgent }) => {
      new CalendarSyncAgent().createReminder({
        userId: req.user.id,
        grantId,
        remindAt: new Date(remindAt),
        description: req.__('REMINDER_FOR_GRANT', { grantId })
      });
    });
    
    res.json({ success: true, reminderId: `rem_${Date.now()}` });
  } catch (error) {
    logger.error('Reminder creation failed', error);
    res.status(500).json({ error: req.__('SERVER_ERROR') });
  }
});

export default router;