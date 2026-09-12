import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.js';

dotenv.config();

await connectDb();

const adminEmail = 'admin@liemresearch.com';
const passwordHash = await bcrypt.hash('Admin123456', 10);

const admin = await User.findOneAndUpdate(
  { email: adminEmail },
  {
    fullName: 'LiemResearch Admin',
    university: 'FPT University',
    email: adminEmail,
    passwordHash,
    role: 'admin',
  },
  { upsert: true, new: true }
);

console.log('Admin account is ready:');
console.log(`Email: ${admin.email}`);
console.log('Password: Admin123456');

process.exit(0);
