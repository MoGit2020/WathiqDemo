require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

console.log('Seeding database...');

const HASH = (pw) => bcrypt.hashSync(pw, 10);

// ─── Users ────────────────────────────────────────────────────────────────────

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
    (name, email, password, role, civil_id, mobile, nationality, sector, malaa_score, avatar_url, rating, verified)
  VALUES
    (@name, @email, @password, @role, @civil_id, @mobile, @nationality, @sector, @malaa_score, @avatar_url, @rating, @verified)
`);

const users = [
  // Tenant
  {
    name: 'Sara Khan', email: 'sara.khan@gmail.com', password: HASH('tenant123'),
    role: 'tenant', civil_id: 'CV99281', mobile: '99887766',
    nationality: 'Expat (Resident)', sector: 'Private Sector (Oil & Gas)',
    malaa_score: 720,
    avatar_url: 'https://ui-avatars.com/api/?name=Sara+Khan&background=db2777&color=fff',
    rating: 4.8, verified: 1,
  },
  // Landlords
  {
    name: 'Ahmed Al-Harthi', email: 'ahmed@wathiq.om', password: HASH('landlord123'),
    role: 'landlord', civil_id: 'CV111', mobile: '99112233',
    nationality: 'Omani', sector: null, malaa_score: 0,
    avatar_url: 'https://ui-avatars.com/api/?name=Ahmed+Harthi&background=0f172a&color=fff',
    rating: 4.9, verified: 1,
  },
  {
    name: 'Salim Al-Alawi', email: 'salim@wathiq.om', password: HASH('landlord123'),
    role: 'landlord', civil_id: 'CV222', mobile: '99223344',
    nationality: 'Omani', sector: null, malaa_score: 0,
    avatar_url: 'https://ui-avatars.com/api/?name=Salim+Alawi&background=1e293b&color=fff',
    rating: 4.7, verified: 1,
  },
  {
    name: 'Said Al-Mamari', email: 'said@wathiq.om', password: HASH('landlord123'),
    role: 'landlord', civil_id: 'CV333', mobile: '99334455',
    nationality: 'Omani', sector: null, malaa_score: 0,
    avatar_url: 'https://ui-avatars.com/api/?name=Said+Mamari&background=334155&color=fff',
    rating: 4.5, verified: 1,
  },
  {
    name: 'Khlfan Al-Siyabi', email: 'khlfan@wathiq.om', password: HASH('landlord123'),
    role: 'landlord', civil_id: 'CV444', mobile: '99445566',
    nationality: 'Omani', sector: null, malaa_score: 0,
    avatar_url: 'https://ui-avatars.com/api/?name=Khlfan+Siyabi&background=475569&color=fff',
    rating: 4.2, verified: 0,
  },
];

for (const u of users) insertUser.run(u);

// ─── Reviews ──────────────────────────────────────────────────────────────────

const ahmed   = db.prepare('SELECT id FROM users WHERE civil_id = ?').get('CV111');
const salim   = db.prepare('SELECT id FROM users WHERE civil_id = ?').get('CV222');
const sara    = db.prepare('SELECT id FROM users WHERE civil_id = ?').get('CV99281');

const insertReview = db.prepare(`
  INSERT OR IGNORE INTO reviews (reviewer_id, subject_id, comment, rating)
  VALUES (@reviewer_id, @subject_id, @comment, @rating)
`);

if (ahmed && sara) {
  insertReview.run({ reviewer_id: ahmed.id, subject_id: sara.id,   comment: 'Paid rent on time every month via Direct Debit.', rating: 5 });
  insertReview.run({ reviewer_id: salim.id, subject_id: sara.id,   comment: 'Kept the apartment very clean.',                  rating: 5 });
  // Landlord reviews
  insertReview.run({ reviewer_id: sara.id,  subject_id: ahmed.id,  comment: 'Very responsive to maintenance requests.',        rating: 5 });
  insertReview.run({ reviewer_id: sara.id,  subject_id: ahmed.id,  comment: 'Fair and honest landlord.',                      rating: 5 });
}

// ─── Properties ───────────────────────────────────────────────────────────────

const insertProp = db.prepare(`
  INSERT OR IGNORE INTO properties
    (landlord_id, title, price, beds, baths, area, location, block, way, building, plot,
     elec_account, water_account, image_url, status)
  VALUES
    (@landlord_id, @title, @price, @beds, @baths, @area, @location, @block, @way,
     @building, @plot, @elec_account, @water_account, @image_url, @status)
`);

const landlordId = (civilId) => db.prepare('SELECT id FROM users WHERE civil_id = ?').get(civilId)?.id;

const PROPERTIES = [
  { landlord_id: landlordId('CV111'), title: 'Sea View 2BHK - Al Mouj',       price: 600,  beds: 2, baths: 3, area: 145, location: 'Marsa 1, Al Mouj',          block: 'Marsa 1', way: '401', building: 'B-12', plot: '88-A', elec_account: '2022-88123', water_account: '2022-77321', image_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV222'), title: 'Luxury Villa - Muscat Hills',    price: 950,  beds: 4, baths: 5, area: 350, location: 'Golf View, Muscat Hills',    block: 'MH-2',    way: '202', building: 'V-55', plot: '22-B', elec_account: '2021-44321', water_account: '2021-33210', image_url: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV333'), title: 'Modern Studio - Azaiba',         price: 300,  beds: 1, baths: 1, area: 75,  location: 'Azaiba North',              block: 'AZ-1',    way: '101', building: 'S-10', plot: '12-C', elec_account: '2023-11000', water_account: '2023-22000', image_url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV444'), title: 'Family Apt - Bausher',           price: 450,  beds: 3, baths: 3, area: 180, location: 'Bausher Heights',           block: 'BA-3',    way: '303', building: 'A-22', plot: '44-D', elec_account: '2020-55555', water_account: '2020-66666', image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV111'), title: 'Beachfront Villa - Shatti',      price: 1200, beds: 5, baths: 6, area: 450, location: 'Shatti Al Qurum',           block: 'SQ-1',    way: '505', building: 'V-01', plot: '01-A', elec_account: '2019-01010', water_account: '2019-02020', image_url: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV222'), title: 'City Apt - Qurum',               price: 500,  beds: 2, baths: 2, area: 120, location: 'Qurum Commercial Area',     block: 'QC-2',    way: '606', building: 'C-09', plot: '99-E', elec_account: '2022-09090', water_account: '2022-08080', image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV333'), title: 'Student Flat - Al Khoud',        price: 250,  beds: 1, baths: 1, area: 60,  location: 'Al Khoud Souq',            block: 'AK-4',    way: '707', building: 'F-12', plot: '12-F', elec_account: '2023-77777', water_account: '2023-88888', image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV444'), title: 'Cozy 2BHK - Seeb',              price: 350,  beds: 2, baths: 2, area: 110, location: 'Seeb Sea Road',             block: 'SE-5',    way: '808', building: 'H-88', plot: '88-G', elec_account: '2021-88881', water_account: '2021-88882', image_url: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&q=80', status: 'available' },
  { landlord_id: landlordId('CV111'), title: 'Commercial Space - Ruwi',        price: 700,  beds: 0, baths: 1, area: 200, location: 'Ruwi CBD',                  block: 'RU-6',    way: '909', building: 'O-99', plot: '99-H', elec_account: '2020-99999', water_account: '2020-10101', image_url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80', status: 'available' },
];

for (const p of PROPERTIES) insertProp.run(p);

console.log('✓ Seed complete.');
console.log('');
console.log('Demo credentials:');
console.log('  Tenant  → sara.khan@gmail.com   / tenant123');
console.log('  Landlord→ ahmed@wathiq.om       / landlord123');
