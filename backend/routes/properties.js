const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

function withLandlord(prop) {
  if (!prop) return null;
  const landlord = db.prepare(`
    SELECT id, name, civil_id, mobile, avatar_url, rating, verified FROM users WHERE id = ?
  `).get(prop.landlord_id);
  const reviews = db.prepare(`
    SELECT r.comment, r.rating, u.name AS reviewer
    FROM reviews r JOIN users u ON u.id = r.reviewer_id
    WHERE r.subject_id = ?
  `).all(prop.landlord_id);
  return { ...prop, landlord, landlord_reviews: reviews };
}

// GET /api/properties  – list (public)
router.get('/', (req, res) => {
  const { status = 'available', landlord_id, min_price, max_price, beds, search } = req.query;

  let sql = `SELECT * FROM properties WHERE 1=1`;
  const params = {};

  if (status)      { sql += ` AND status = @status`;              params.status = status; }
  if (landlord_id) { sql += ` AND landlord_id = @landlord_id`;    params.landlord_id = Number(landlord_id); }
  if (min_price)   { sql += ` AND price >= @min_price`;           params.min_price = Number(min_price); }
  if (max_price)   { sql += ` AND price <= @max_price`;           params.max_price = Number(max_price); }
  if (beds)        { sql += ` AND beds >= @beds`;                 params.beds = Number(beds); }
  if (search)      { sql += ` AND (title LIKE @q OR location LIKE @q)`; params.q = `%${search}%`; }

  sql += ` ORDER BY created_at DESC`;

  const rows = db.prepare(sql).all(params);
  res.json(rows.map(withLandlord));
});

// GET /api/properties/:id  – single (public)
router.get('/:id', (req, res) => {
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  res.json(withLandlord(prop));
});

// POST /api/properties  – create (landlord only)
router.post('/', authenticate, requireRole('landlord'), (req, res) => {
  const {
    title, price, beds = 0, baths = 0, area,
    location, block, way, building, plot,
    elec_account, water_account, image_url,
  } = req.body;

  if (!title || !price) {
    return res.status(400).json({ error: 'title and price are required' });
  }

  const result = db.prepare(`
    INSERT INTO properties
      (landlord_id, title, price, beds, baths, area, location, block, way,
       building, plot, elec_account, water_account, image_url)
    VALUES
      (@landlord_id, @title, @price, @beds, @baths, @area, @location, @block,
       @way, @building, @plot, @elec_account, @water_account, @image_url)
  `).run({
    landlord_id: req.user.id, title, price: Number(price),
    beds: Number(beds), baths: Number(baths), area: area ? Number(area) : null,
    location: location || null, block: block || null, way: way || null,
    building: building || null, plot: plot || null,
    elec_account: elec_account || null, water_account: water_account || null,
    image_url: image_url || null,
  });

  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(withLandlord(prop));
});

// PATCH /api/properties/:id  – update (owner landlord only)
router.patch('/:id', authenticate, requireRole('landlord'), (req, res) => {
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  if (prop.landlord_id !== req.user.id) return res.status(403).json({ error: 'Not your property' });

  const allowed = ['title', 'price', 'beds', 'baths', 'area', 'location', 'block', 'way',
                   'building', 'plot', 'elec_account', 'water_account', 'image_url', 'status'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE properties SET ${set} WHERE id = @id`).run({ ...updates, id: prop.id });

  const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(prop.id);
  res.json(withLandlord(updated));
});

// DELETE /api/properties/:id  – delete (owner landlord only)
router.delete('/:id', authenticate, requireRole('landlord'), (req, res) => {
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  if (prop.landlord_id !== req.user.id) return res.status(403).json({ error: 'Not your property' });

  db.prepare('DELETE FROM properties WHERE id = ?').run(prop.id);
  res.json({ message: 'Property deleted' });
});

// GET /api/properties/:id/reviews  – landlord reviews for a property's landlord
router.get('/:id/reviews', (req, res) => {
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  const reviews = db.prepare(`
    SELECT r.id, r.comment, r.rating, r.created_at, u.name AS reviewer
    FROM reviews r JOIN users u ON u.id = r.reviewer_id
    WHERE r.subject_id = ?
    ORDER BY r.created_at DESC
  `).all(prop.landlord_id);
  res.json(reviews);
});

module.exports = router;
