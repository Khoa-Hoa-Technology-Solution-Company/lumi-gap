-- In-situ calibration (GapClose Theorem 1): epsHat measured against the same sources already counts answers that are
-- missing from them, so B = epsHat. TRANSFER keeps B = epsHat + pHat. Existing calibrations keep the old formula.
ALTER TABLE "closure_calibrations" ADD COLUMN "mode" VARCHAR(16) NOT NULL DEFAULT 'TRANSFER';
ALTER TABLE "closure_calibrations" ADD CONSTRAINT "closure_calibrations_mode_check" CHECK ("mode" IN ('IN_SITU', 'TRANSFER'));
-- Which formula produced the stored bound of a decided check; null when no bound was computed.
ALTER TABLE "gap_closure_checks" ADD COLUMN "bound_mode" VARCHAR(16);
ALTER TABLE "gap_closure_checks" ADD CONSTRAINT "gap_closure_checks_bound_mode_check" CHECK ("bound_mode" IS NULL OR "bound_mode" IN ('IN_SITU', 'TRANSFER'));
