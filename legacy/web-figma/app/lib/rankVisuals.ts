import lv1 from '../../imports/lv1.png';
import lv2 from '../../imports/lv2.png';
import lv3 from '../../imports/lv3.png';
import lv4 from '../../imports/lv4.png';
import lv5 from '../../imports/lv5.png';
import lv6 from '../../imports/lv6.png';
import lv7 from '../../imports/lv7.png';
import lv8 from '../../imports/lv8.png';
import lv9 from '../../imports/lv9.png';
import lv10 from '../../imports/lv10.png';

const RANK_IMAGES = [lv1, lv2, lv3, lv4, lv5, lv6, lv7, lv8, lv9, lv10] as const;

export function getRankImage(level: number) {
  const safeLevel = Math.min(Math.max(level, 1), RANK_IMAGES.length);
  return RANK_IMAGES[safeLevel - 1];
}