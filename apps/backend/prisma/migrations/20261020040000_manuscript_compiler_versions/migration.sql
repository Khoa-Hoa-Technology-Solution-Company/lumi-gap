ALTER TABLE "manuscript_compilations" ADD COLUMN "tex_live_version" VARCHAR(4) NOT NULL DEFAULT '2022';
ALTER TABLE "manuscript_compilations" ADD CONSTRAINT "manuscript_compilation_tex_live_version" CHECK ("tex_live_version" IN ('2022', '2025'));
