export interface RankConfig {
  level: number;
  name: string;
  minPoints: number;
  minPapers: number;
}

export const RANK_LEVELS: RankConfig[] = [
  { level: 1, name: 'Fresh Scholar', minPoints: 0, minPapers: 0 },
  { level: 2, name: 'Junior Researcher', minPoints: 500, minPapers: 5 },
  { level: 3, name: 'Thesis Contributor', minPoints: 1500, minPapers: 15 },
  { level: 4, name: 'Citation Master', minPoints: 3500, minPapers: 35 },
  { level: 5, name: 'Library Guardian', minPoints: 7000, minPapers: 70 },
  { level: 6, name: 'Knowledge Champion', minPoints: 12000, minPapers: 120 },
  { level: 7, name: 'Academic Commander', minPoints: 20000, minPapers: 200 },
  { level: 8, name: 'Wisdom Monarch', minPoints: 35000, minPapers: 350 },
  { level: 9, name: 'Science Sovereign', minPoints: 60000, minPapers: 600 },
  { level: 10, name: 'Research Legend', minPoints: 100000, minPapers: 1000 },
];

export const calculateCurrentRank = (lifetimePoints: number, totalApprovedPapers: number): RankConfig => {
  for (let index = RANK_LEVELS.length - 1; index >= 0; index -= 1) {
    const rank = RANK_LEVELS[index];

    if (lifetimePoints >= rank.minPoints && totalApprovedPapers >= rank.minPapers) {
      return rank;
    }
  }

  return RANK_LEVELS[0];
};
