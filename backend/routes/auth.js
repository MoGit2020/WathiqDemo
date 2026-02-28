const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, role, civil_id, mobile, nationality, sector } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }
  if (!['tenant', 'landlord'].includes(role)) {
    return res.status(400).json({ error: 'role must be tenant or landlord' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, password, role, civil_id, mobile, nationality, sector)
    VALUES (@name, @email, @password, @role, @civil_id, @mobile, @nationality, @sector)
  `).run({ name, email, password: hashed, role, civil_id: civil_id || null, mobile: mobile || null, nationality: nationality || null, sector: sector || null });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: safeUser(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({ token: signToken(user), user: safeUser(user) });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
});

// PATCH /api/auth/me  – update profile
router.patch('/me', authenticate, (req, res) => {
  const allowed = ['name', 'mobile', 'nationality', 'sector', 'avatar_url'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE users SET ${set} WHERE id = @id`).run({ ...updates, id: req.user.id });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(safeUser(user));
});

module.exports = router;
