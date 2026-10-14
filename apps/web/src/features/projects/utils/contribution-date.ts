export const contributionTimeZone = "Asia/Ho_Chi_Minh";

export function contributionDate(value: string | Date = new Date(), timeZone = contributionTimeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
