ALTER TABLE screening_settings
  ADD COLUMN authorized_adjudicator_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN allow_conservative_full_text boolean NOT NULL DEFAULT false;
