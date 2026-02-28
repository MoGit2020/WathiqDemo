const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function enrichPayment(p) {
  const contract = db.prepare('SELECT id, reference_no, rent_amount, status AS contract_status FROM contracts WHERE id = ?').get(p.contract_id);
  const property = contract
    ? db.prepare('SELECT id, title, location FROM properties WHERE id = (SELECT property_id FROM contracts WHERE id = ?)').get(p.contract_id)
    : null;
  return { ...p, contract, property };
}

// GET /api/payments  – all payments for the authenticated user
router.get('/', authenticate, (req, res) => {
  const col = req.user.role === 'tenant' ? 'tenant_id' : 'landlord_id';
  const payments = db.prepare(`SELECT * FROM payments WHERE ${col} = ? ORDER BY due_date ASC`).all(req.user.id);
  res.json(payments.map(enrichPayment));
});

// GET /api/payments/contract/:contractId  – payment history for a contract
router.get('/contract/:contractId', authenticate, (req, res) => {
  const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.contractId);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  if (c.tenant_id !== req.user.id && c.landlord_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const payments = db.prepare('SELECT * FROM payments WHERE contract_id = ? ORDER BY due_date ASC').all(c.id);
  res.json(payments.map(enrichPayment));
});

// GET /api/payments/:id
router.get('/:id', authenticate, (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  if (p.tenant_id !== req.user.id && p.landlord_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(enrichPayment(p));
});

// POST /api/payments/:id/confirm  – tenant confirms a standing order / direct debit payment
router.post('/:id/confirm', authenticate, requireRole('tenant'), (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  if (p.tenant_id !== req.user.id) return res.status(403).json({ error: 'Not your payment' });
  if (p.status === 'paid') return res.status(409).json({ error: 'Payment already confirmed' });

  db.prepare(`
    UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?
  `).run(p.id);

  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id);
  res.json(enrichPayment(updated));
});

// POST /api/payments/standing-order  – tenant authorizes recurring direct debit for a contract
// In production this would integrate with the bank API; here we mark first payment as paid
// and return all scheduled payments.
router.post('/standing-order', authenticate, requireRole('tenant'), (req, res) => {
  const { contract_id } = req.body;
  if (!contract_id) return res.status(400).json({ error: 'contract_id is required' });

  const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contract_id);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  if (c.tenant_id !== req.user.id) return res.status(403).json({ error: 'Not your contract' });
  if (c.status !== 'active') return res.status(409).json({ error: 'Contract must be active before authorizing payments' });

  // Mark first pending payment as paid (direct debit initiated)
  const first = db.prepare(`
    SELECT * FROM payments WHERE contract_id = ? AND status = 'pending' ORDER BY due_date ASC LIMIT 1
  `).get(contract_id);

  if (first) {
    db.prepare(`UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(first.id);
  }

  const allPayments = db.prepare('SELECT * FROM payments WHERE contract_id = ? ORDER BY due_date ASC').all(contract_id);
  res.json({ message: 'Standing order activated', payments: allPayments.map(enrichPayment) });
});

module.exports = router;
