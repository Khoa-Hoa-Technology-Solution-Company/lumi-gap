import { User } from '../models/User.js';
import { calculateUserPointStatsBatch } from '../utils/points.js';

const activeUserFilter = {
  role: 'user',
  $or: [{ status: 'active' }, { status: { $exists: false } }],
};

function serializePublicUser(user, points) {
  return {
    _id: user._id,
    fullName: user.fullName,
    university: user.university,
    role: user.role,
    points,
  };
}

function buildRankings(entries, startRank = 1) {
  return entries.map(({ user, stats }, index) => ({
    rank: startRank + index,
    user: serializePublicUser(user, stats.points),
    ...stats,
  }));
}

async function getRankedUsers() {
  const users = await User.find(activeUserFilter)
    .select('_id fullName university role')
    .lean();
  const statsByUserId = await calculateUserPointStatsBatch(users.map((user) => user._id));

  return users
    .map((user) => ({ user, stats: statsByUserId.get(user._id.toString()) }))
    .sort((left, right) => right.stats.points - left.stats.points || left.user.fullName.localeCompare(right.user.fullName));
}

export async function getTopUsers(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);

    const rankedUsers = await getRankedUsers();
    const total = rankedUsers.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * limit;
    const rankings = buildRankings(rankedUsers.slice(skip, skip + limit), skip + 1);

    res.json({
      rankings,
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error('getTopUsers error', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Internal server error' });
  }
}

export async function getMyRanking(req, res) {
  if (req.user.role !== 'user') {
    return res.status(404).json({ message: 'Ranking is only available for user accounts' });
  }

  const rankedUsers = await getRankedUsers();
  const userIndex = rankedUsers.findIndex(({ user }) => user._id.toString() === req.user._id.toString());

  if (userIndex === -1) {
    return res.status(404).json({ message: 'Ranking not found for current user' });
  }

  const [ranking] = buildRankings([rankedUsers[userIndex]], userIndex + 1);
  res.json({ ranking });
}

export async function getUserRankingById(req, res) {
  const rankedUsers = await getRankedUsers();
  const userIndex = rankedUsers.findIndex(({ user }) => user._id.toString() === req.params.id.toString());

  if (userIndex === -1) {
    return res.status(404).json({ message: 'Ranking not found for user' });
  }

  const [ranking] = buildRankings([rankedUsers[userIndex]], userIndex + 1);
  res.json({ ranking });
}
