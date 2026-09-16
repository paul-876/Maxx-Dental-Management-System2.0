/*
 * Seeds a Super Admin account plus a small set of demo data (dentists,
 * front-desk staff, medicines) so the app is usable immediately.
 * Run with `npm run seed`.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Dentist, Medicine } = require('../src/models');
const { ROLES } = require('../src/utils/constants');
const { normalizePhone } = require('../src/utils/phone');

async function upsertUser({ name, email, phone, password, role, professionalInfo }) {
  phone = normalizePhone(phone);
  let user = await User.findOne({ where: { phone } });
  if (user) return user;
  const hashed = await bcrypt.hash(password, 10);
  user = await User.create({ name, email, phone, password: hashed, role, professionalInfo });
  return user;
}

async function main() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  const superAdmin = await upsertUser({
    name: 'Super Admin',
    email: 'admin@maxdental.example',
    phone: '0700000001',
    password: 'Admin@123',
    role: ROLES.SUPER_ADMIN,
  });

  // One shared Front Desk account — used by whoever is covering reception,
  // cashier, or pharmacy duties. After logging in they pick which area to
  // work in from the Front Desk hub screen.
  const frontDesk = await upsertUser({
    name: 'Front Desk',
    email: 'frontdesk@maxdental.example',
    phone: '0700000002',
    password: 'FrontDesk@123',
    role: ROLES.FRONT_DESK,
  });

  const dentistUser = await upsertUser({
    name: 'Dr. James Mwangi',
    email: 'dentist@maxdental.example',
    phone: '0700000005',
    password: 'Dentist@123',
    role: ROLES.DENTIST,
    professionalInfo: 'BDS, University of Nairobi',
  });

  let dentistProfile = await Dentist.findOne({ where: { userId: dentistUser.id } });
  if (!dentistProfile) {
    dentistProfile = await Dentist.create({ userId: dentistUser.id, specialization: 'General Dentistry' });
  }

  const medicineNames = [
    { name: 'Amoxicillin 500mg', quantity: 200, price: 15, lowStockThreshold: 30 },
    { name: 'Ibuprofen 400mg', quantity: 150, price: 10, lowStockThreshold: 30 },
    { name: 'Paracetamol 500mg', quantity: 300, price: 5, lowStockThreshold: 50 },
    { name: 'Chlorhexidine Mouthwash', quantity: 40, price: 250, lowStockThreshold: 10 },
    { name: 'Lidocaine Injection', quantity: 60, price: 80, lowStockThreshold: 15 },
  ];
  for (const m of medicineNames) {
    const existing = await Medicine.findOne({ where: { name: m.name } });
    if (!existing) await Medicine.create(m);
  }

  console.log('\nSeed complete. Demo login credentials:\n');
  console.log('  Super Admin  | phone: 0700000001 | password: Admin@123');
  console.log('  Front Desk   | phone: 0700000002 | password: FrontDesk@123  (Reception, Cashier & Pharmacy)');
  console.log('  Dentist      | phone: 0700000005 | password: Dentist@123');
  console.log('\n(Phone numbers are normalized to +254 format on login too.)\n');

  await sequelize.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
