import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { deleteUserRelatedData } from '../utils/paperCleanup.js';
import { syncUserPoints } from '../utils/points.js';
import { normalizeText, validateFullName, validateUniversity } from '../utils/validation.js';
import { escapeRegexSearch } from '../utils/search.js';

function isInvalidUserId(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

function buildUserFilter({ search, role, status }) {
  const filter = {};

  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const escapedSearch = escapeRegexSearch(search);
    filter.$or = [
      { fullName: { $regex: escapedSearch, $options: 'i' } },
      { email: { $regex: escapedSearch, $options: 'i' } },
      { university: { $regex: escapedSearch, $options: 'i' } },
    ];
  }

  return filter;
}

export async function getUsers(req, res) {
  const { search, role, status } = req.query;
  const filter = buildUserFilter({ search, role, status });

  const users = await User.find(filter)
    .select('-passwordHash')
    .sort({ createdAt: -1 });

  res.json({ users });
}

export async function getUserById(req, res) {
  if (isInvalidUserId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const user = await User.findById(req.params.id).select('-passwordHash');

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ user });
}

export async function updateUser(req, res) {
  if (isInvalidUserId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const allowedFields = ['fullName', 'university', 'role', 'status'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields provided' });
  }

  if (updates.fullName !== undefined && !updates.fullName) {
    return res.status(400).json({ message: 'Full name is required' });
  }

  if (updates.fullName !== undefined) {
    const fullNameError = validateFullName(updates.fullName);
    if (fullNameError) {
      return res.status(400).json({ message: fullNameError });
    }
    updates.fullName = normalizeText(updates.fullName);
  }

  if (updates.university !== undefined && !updates.university) {
    return res.status(400).json({ message: 'University is required' });
  }

  if (updates.university !== undefined) {
    const universityError = validateUniversity(updates.university);
    if (universityError) {
      return res.status(400).json({ message: universityError });
    }
    updates.university = normalizeText(updates.university);
  }

  if (updates.role !== undefined && !['user', 'admin'].includes(updates.role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  if (updates.status !== undefined && !['active', 'banned'].includes(updates.status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  }).select('-passwordHash');

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ user });
}

export async function updateUserStatus(req, res) {
  const { status } = req.body;

  if (isInvalidUserId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (!['active', 'banned'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  ).select('-passwordHash');

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ user });
}

export async function deleteUser(req, res) {
  if (isInvalidUserId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot delete your own admin account here' });
  }

  const user = await User.findById(req.params.id);

  if (!user) return res.status(404).json({ message: 'User not found' });

  const affectedUserIds = await deleteUserRelatedData(user._id);
  await User.findByIdAndDelete(user._id);
  await Promise.all(affectedUserIds.map((userId) => syncUserPoints(userId)));

  res.json({ message: 'User deleted successfully', userId: user._id });
}
