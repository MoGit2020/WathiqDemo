const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function enrichApp(app) {
  const tenant   = db.prepare('SELECT id, name, email, civil_id, mobile, avatar_url, rating, malaa_score, nationality, sector FROM users WHERE id = ?').get(app.tenant_id);
  const property = db.prepare('SELECT id, title, price, location, image_url, landlord_id FROM properties WHERE id = ?').get(app.property_id);
  const reviews  = db.prepare(`
    SELECT r.comment, r.rating, u.name AS reviewer
    FROM reviews r JOIN users u ON u.id = r.reviewer_id
    WHERE r.subject_id = ?
  `).all(app.tenant_id);
  return { ...app, tenant: { ...tenant, reviews }, property };
}

// POST /api/applications  – tenant submits application
router.post('/', authenticate, requireRole('tenant'), (req, res) => {
  const { property_id, message } = req.body;
  if (!property_id) return res.status(400).json({ error: 'property_id is required' });

  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(property_id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  if (prop.status !== 'available') return res.status(409).json({ error: 'Property is not available' });

  // One active application per tenant per property
  const existing = db.prepare(`
    SELECT id FROM applications
    WHERE tenant_id = ? AND property_id = ? AND status IN ('pending','approved')
  `).get(req.user.id, property_id);
  if (existing) return res.status(409).json({ error: 'You already have an active application for this property' });

  const result = db.prepare(`
    INSERT INTO applications (tenant_id, property_id, message)
    VALUES (@tenant_id, @property_id, @message)
  `).run({ tenant_id: req.user.id, property_id: Number(property_id), message: message || null });

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(enrichApp(app));
});

// GET /api/applications  – list (filtered by role automatically)
router.get('/', authenticate, (req, res) => {
  let apps;
  if (req.user.role === 'tenant') {
    apps = db.prepare('SELECT * FROM applications WHERE tenant_id = ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    // Landlord sees applications for their properties
    apps = db.prepare(`
      SELECT a.* FROM applications a
      JOIN properties p ON p.id = a.property_id
      WHERE p.landlord_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);
  }
  res.json(apps.map(enrichApp));
});

// GET /api/applications/:id
router.get('/:id', authenticate, (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  // Only tenant who applied or landlord who owns the property can see it
  const prop = db.prepare('SELECT landlord_id FROM properties WHERE id = ?').get(app.property_id);
  if (app.tenant_id !== req.user.id && prop.landlord_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(enrichApp(app));
});

// PATCH /api/applications/:id/status  – landlord approves/rejects
router.patch('/:id/status', authenticate, requireRole('landlord'), (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(app.property_id);
  if (prop.landlord_id !== req.user.id) return res.status(403).json({ error: 'Not your property' });
  if (app.status !== 'pending') return res.status(409).json({ error: 'Application is no longer pending' });

  db.prepare(`UPDATE applications SET status = @status, updated_at = datetime('now') WHERE id = @id`)
    .run({ status, id: app.id });

  // Reject all other pending applications for same property if approved
  if (status === 'approved') {
    db.prepare(`
      UPDATE applications SET status = 'rejected', updated_at = datetime('now')
      WHERE property_id = ? AND id != ? AND status = 'pending'
    `).run(app.property_id, app.id);
  }

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
  res.json(enrichApp(updated));
});

// DELETE /api/applications/:id  – tenant withdraws
router.delete('/:id', authenticate, requireRole('tenant'), (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.tenant_id !== req.user.id) return res.status(403).json({ error: 'Not your application' });
  if (!['pending'].includes(app.status)) return res.status(409).json({ error: 'Can only withdraw pending applications' });

  db.prepare(`UPDATE applications SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?`).run(app.id);
  res.json({ message: 'Application withdrawn' });
});

module.exports = router;
