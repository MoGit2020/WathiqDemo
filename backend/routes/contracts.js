const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function refNo() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `${year}-WQ-${rand}`;
}

function enrichContract(c) {
  const tenant   = db.prepare('SELECT id, name, email, civil_id, mobile, avatar_url, rating FROM users WHERE id = ?').get(c.tenant_id);
  const landlord = db.prepare('SELECT id, name, email, civil_id, mobile, avatar_url, rating FROM users WHERE id = ?').get(c.landlord_id);
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(c.property_id);
  return { ...c, tenant, landlord, property };
}

// POST /api/contracts  – landlord creates contract after approving an application
router.post('/', authenticate, requireRole('landlord'), (req, res) => {
  const { application_id, start_date, end_date } = req.body;
  if (!application_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'application_id, start_date, and end_date are required' });
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(application_id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'approved') return res.status(409).json({ error: 'Application must be approved first' });

  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(app.property_id);
  if (prop.landlord_id !== req.user.id) return res.status(403).json({ error: 'Not your property' });

  // Only one contract per application
  const existing = db.prepare('SELECT id FROM contracts WHERE application_id = ?').get(application_id);
  if (existing) return res.status(409).json({ error: 'Contract already exists for this application' });

  const result = db.prepare(`
    INSERT INTO contracts
      (application_id, property_id, tenant_id, landlord_id, rent_amount, start_date, end_date, reference_no)
    VALUES
      (@application_id, @property_id, @tenant_id, @landlord_id, @rent_amount, @start_date, @end_date, @reference_no)
  `).run({
    application_id: Number(application_id),
    property_id: prop.id,
    tenant_id: app.tenant_id,
    landlord_id: req.user.id,
    rent_amount: prop.price,
    start_date,
    end_date,
    reference_no: refNo(),
  });

  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(enrichContract(contract));
});

// GET /api/contracts  – list (filtered by role)
router.get('/', authenticate, (req, res) => {
  let contracts;
  if (req.user.role === 'tenant') {
    contracts = db.prepare('SELECT * FROM contracts WHERE tenant_id = ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    contracts = db.prepare('SELECT * FROM contracts WHERE landlord_id = ? ORDER BY created_at DESC').all(req.user.id);
  }
  res.json(contracts.map(enrichContract));
});

// GET /api/contracts/:id
router.get('/:id', authenticate, (req, res) => {
  const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  if (c.tenant_id !== req.user.id && c.landlord_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(enrichContract(c));
});

// POST /api/contracts/:id/sign  – tenant or landlord signs
router.post('/:id/sign', authenticate, (req, res) => {
  const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contract not found' });

  const isTenant   = c.tenant_id   === req.user.id;
  const isLandlord = c.landlord_id === req.user.id;

  if (!isTenant && !isLandlord) return res.status(403).json({ error: 'Access denied' });

  // Determine next status
  if (isTenant && req.user.role === 'tenant') {
    if (c.tenant_signed_at) return res.status(409).json({ error: 'Already signed by tenant' });
    const newStatus = c.landlord_signed_at ? 'active' : 'tenant_signed';
    db.prepare(`
      UPDATE contracts SET tenant_signed_at = datetime('now'), status = ? WHERE id = ?
    `).run(newStatus, c.id);

    if (newStatus === 'active') {
      // Mark property as rented and schedule first payment
      db.prepare(`UPDATE properties SET status = 'rented' WHERE id = ?`).run(c.property_id);
      schedulePayments(c);
    }
  } else if (isLandlord && req.user.role === 'landlord') {
    if (c.landlord_signed_at) return res.status(409).json({ error: 'Already signed by landlord' });
    const newStatus = c.tenant_signed_at ? 'active' : 'landlord_signed';
    db.prepare(`
      UPDATE contracts SET landlord_signed_at = datetime('now'), status = ? WHERE id = ?
    `).run(newStatus, c.id);

    if (newStatus === 'active') {
      db.prepare(`UPDATE properties SET status = 'rented' WHERE id = ?`).run(c.property_id);
      schedulePayments(c);
    }
  } else {
    return res.status(403).json({ error: 'Role mismatch' });
  }

  const updated = db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id);
  res.json(enrichContract(updated));
});

// Helpers: create monthly payment records when contract goes active
function schedulePayments(contract) {
  const start = new Date(contract.start_date);
  const end   = new Date(contract.end_date);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO payments
      (contract_id, tenant_id, landlord_id, amount, platform_fee, due_date, status, transaction_ref)
    VALUES
      (@contract_id, @tenant_id, @landlord_id, @amount, @platform_fee, @due_date, 'pending', @transaction_ref)
  `);

  const current = new Date(start);
  while (current <= end) {
    const dueDate = current.toISOString().slice(0, 10);
    insert.run({
      contract_id: contract.id,
      tenant_id: contract.tenant_id,
      landlord_id: contract.landlord_id,
      amount: contract.rent_amount,
      platform_fee: +(contract.rent_amount * 0.05).toFixed(3),
      due_date: dueDate,
      transaction_ref: `TXN-${contract.id}-${dueDate}`,
    });
    current.setMonth(current.getMonth() + 1);
  }
}

module.exports = router;
