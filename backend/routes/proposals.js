// backend/routes/proposals.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbRouter } from '../services/dbRouter.js';
import { logger } from '../utils/logger.js';
import authMiddleware from '../routes/auth.js';
import { validateProposal as defaultValidateProposal } from '../utils/metrics.js';

const router = express.Router();

function translate(req, key) {
  return typeof req.__ === 'function' ? req.__(key) : key;
}

// Generate new proposal
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const validateProposal = typeof defaultValidateProposal === 'function'
      ? defaultValidateProposal
      : (data) => ({ value: data });

    const { error, value } = validateProposal(req.body);
    if (error) return res.status(400).json({ error: error.details?.[0]?.message || 'Invalid input' });

    const { opportunity, missionStatement, organization, language, tone } = value;
    const proposalId = `prop_${uuidv4()}`;
    const lang = language || req.language || req.getLocale?.() || 'en';

    let proposalQueue;
    try {
      ({ proposalQueue } = await import('../orchestration/queue.js'));
      if (!proposalQueue?.add) throw new Error('proposalQueue.add missing');
    } catch (queueErr) {
      logger.error('Queue import failed', queueErr);
      return res.status(500).json({ error: translate(req, 'SERVER_ERROR') });
    }

    await proposalQueue.add(
      'generate_proposal',
      { payload: { opportunity, missionStatement, organization, language: lang, tone: tone || 'formal', proposalId } },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, priority: req.user?.role === 'premium' ? 1 : 10 }
    );

    res.status(202).json({
      proposalId,
      status: 'queued',
      message: translate(req, 'PROPOSAL_GENERATION_STARTED')
    });

    logger.info(`NewProposal queued [${proposalId}] for user ${req.user?.id || 'unknown'}`);
  } catch (error) {
    logger.error('Proposal generation failed', error);
    res.status(500).json({ error: translate(req, 'SERVER_ERROR') });
  }
});

// List user proposals
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const { status = 'all', sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    const db = dbRouter.getAdapter();
    if (!db) throw new Error('Database adapter missing');

    const skip = (page - 1) * limit;
    let proposals = [];
    let total = 0;

    if (db.model) {
      // MongoDB
      [proposals, total] = await Promise.all([
        db.model('Proposal')
          .find({ authorId: req.user.id, ...(status !== 'all' ? { status } : {}) })
          .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        db.model('Proposal').countDocuments({ authorId: req.user.id, ...(status !== 'all' ? { status } : {}) })
      ]);
    } else if (db.adapters?.sqlite) {
      // SQLite
      const sqlite = db.adapters.sqlite;
      if (!sqlite) throw new Error('SQLite adapter missing');

      const whereClauses = ['authorId = ?'];
      const params = [req.user.id];
      if (status !== 'all') { whereClauses.push('status = ?'); params.push(status); }

      const orderDir = sortOrder === 'desc' ? 'DESC' : 'ASC';
      proposals = await sqlite.sqliteConnection.all(
        `SELECT * FROM proposals WHERE ${whereClauses.join(' AND ')} ORDER BY ${sortBy} ${orderDir} LIMIT ? OFFSET ?`,
        [...params, limit, skip]
      );

      total = (await sqlite.sqliteConnection.get(
        `SELECT COUNT(*) as count FROM proposals WHERE ${whereClauses.join(' AND ')}`,
        params
      ))?.count || 0;
    } else {
      throw new Error('No supported database adapter found');
    }

    proposals = proposals.map((p) => ({ ...p, status: p.status || 'draft' }));

    res.json({ proposals, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    logger.error('Proposal listing failed', error);
    res.status(500).json({ error: translate(req, 'SERVER_ERROR') });
  }
});

export default router;
