import fs from "fs";

const c = fs.readFileSync("apps/web/src/features/projects/components/my-work-view.tsx", "utf8");
const lines = c.split("\n");
lines.forEach((l, i) => {
  if (l.includes("Hạn gửi") || l.includes("ý kiến") || l.includes("Cần gửi")) {
    console.log(`${i + 1}: ${l.trim()}`);
  }
});
