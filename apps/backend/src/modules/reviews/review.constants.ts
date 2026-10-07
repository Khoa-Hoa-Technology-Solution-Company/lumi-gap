/** Review request statuses that mean the review is still in progress. */
export const ACTIVE_REVIEW_REQUEST_STATUSES = ["REQUESTED", "ACCEPTED", "IN_REVIEW", "SUBMITTED", "REVISION_REQUESTED", "RESUBMITTED"];

export const defaultReviewCriteria = [
  ["research_gap", "Research Gap", "Is the stated gap specific, evidence-backed, and appropriately scoped?"],
  ["contribution", "Contribution", "Is the claimed contribution clear and supported by the manuscript?"],
  ["novelty", "Novelty", "Does the work distinguish itself cautiously from related work?"],
  ["research_questions", "Research Questions", "Do the questions align with the goal and evidence?"],
  ["methodology", "Methodology", "Is the method appropriate, transparent, and reproducible?"],
  ["validity", "Validity", "Are threats to validity identified and handled?"],
  ["evidence", "Evidence", "Do the results support the claims being made?"],
  ["reproducibility", "Reproducibility", "Is enough detail supplied to reproduce or audit the work?"],
  ["citation", "Citation", "Is relevant prior work represented and cited responsibly?"],
  ["presentation", "Presentation", "Is the manuscript coherent and academically readable?"],
] as const;
