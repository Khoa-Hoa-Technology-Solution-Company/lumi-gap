import lv1 from '@/imports/lv1.png';
import lv2 from '@/imports/lv2.png';
import lv3 from '@/imports/lv3.png';
import lv4 from '@/imports/lv4.png';
import lv5 from '@/imports/lv5.png';
import lv6 from '@/imports/lv6.png';
import lv7 from '@/imports/lv7.png';
import lv8 from '@/imports/lv8.png';
import lv9 from '@/imports/lv9.png';
import lv10 from '@/imports/lv10.png';

export const avatars: Record<number, string> = {
  1: lv1,
  2: lv2,
  3: lv3,
  4: lv4,
  5: lv5,
  6: lv6,
  7: lv7,
  8: lv8,
  9: lv9,
  10: lv10,
};

export { LEVEL_THRESHOLDS, getLevel, getLevelProgress, getNextLevelPoints } from "@trend/shared-types";
