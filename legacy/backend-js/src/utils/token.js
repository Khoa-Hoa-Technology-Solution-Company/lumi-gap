import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET || 'liemresearch_local_secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}
