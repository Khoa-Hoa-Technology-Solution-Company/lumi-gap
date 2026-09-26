-- Relational integrity is kept in SQL because the transition repositories use
-- explicit UUID scalars while MongoDB and PostgreSQL coexist. Prisma Client
-- remains the query layer; these constraints are the database safety boundary.

-- Identity and academic profile.
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "academic_profile_handles" ADD CONSTRAINT "academic_profile_handles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "academic_external_identities" ADD CONSTRAINT "academic_external_identities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "academic_profiles"("id") ON DELETE CASCADE;
ALTER TABLE "academic_featured_works" ADD CONSTRAINT "academic_featured_works_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "academic_profiles"("id") ON DELETE CASCADE;
ALTER TABLE "academic_featured_works" ADD CONSTRAINT "academic_featured_works_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "academic_verification_evidence" ADD CONSTRAINT "academic_verification_evidence_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "academic_profiles"("id") ON DELETE CASCADE;
ALTER TABLE "academic_email_verification_challenges" ADD CONSTRAINT "academic_email_verification_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "trusted_institution_domains" ADD CONSTRAINT "trusted_institution_domains_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "trusted_institutions"("id") ON DELETE CASCADE;

-- Scholarly catalog.
ALTER TABLE "author_affiliations" ADD CONSTRAINT "author_affiliations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE CASCADE;
ALTER TABLE "journal_issns" ADD CONSTRAINT "journal_issns_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE CASCADE;
ALTER TABLE "research_topics" ADD CONSTRAINT "research_topics_parent_topic_id_fkey" FOREIGN KEY ("parent_topic_id") REFERENCES "research_topics"("id") ON DELETE SET NULL;
ALTER TABLE "papers" ADD CONSTRAINT "papers_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE SET NULL;
ALTER TABLE "papers" ADD CONSTRAINT "papers_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "papers" ADD CONSTRAINT "papers_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "paper_authors" ADD CONSTRAINT "paper_authors_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_authors" ADD CONSTRAINT "paper_authors_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL;
ALTER TABLE "paper_keywords" ADD CONSTRAINT "paper_keywords_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_keywords" ADD CONSTRAINT "paper_keywords_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "keywords"("id") ON DELETE SET NULL;
ALTER TABLE "paper_topics" ADD CONSTRAINT "paper_topics_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_topics" ADD CONSTRAINT "paper_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "research_topics"("id") ON DELETE SET NULL;
ALTER TABLE "paper_identities" ADD CONSTRAINT "paper_identities_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_identities" ADD CONSTRAINT "paper_identities_first_seen_campaign_id_fkey" FOREIGN KEY ("first_seen_campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "paper_source_records" ADD CONSTRAINT "paper_source_records_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_source_records" ADD CONSTRAINT "paper_source_records_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "api_providers"("id") ON DELETE RESTRICT;
ALTER TABLE "paper_quality_checks" ADD CONSTRAINT "paper_quality_checks_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_downloads" ADD CONSTRAINT "paper_downloads_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_downloads" ADD CONSTRAINT "paper_downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "paper_translations" ADD CONSTRAINT "paper_translations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_reviews" ADD CONSTRAINT "paper_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "paper_reviews" ADD CONSTRAINT "paper_reviews_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "paper_format_checks" ADD CONSTRAINT "paper_format_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

-- Projects, communities and collaboration.
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "project_papers" ADD CONSTRAINT "project_papers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_papers" ADD CONSTRAINT "project_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "project_papers" ADD CONSTRAINT "project_papers_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "project_chat_messages" ADD CONSTRAINT "project_chat_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_chat_messages" ADD CONSTRAINT "project_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "project_chat_messages" ADD CONSTRAINT "project_chat_messages_pinned_by_id_fkey" FOREIGN KEY ("pinned_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "project_chat_messages" ADD CONSTRAINT "project_chat_messages_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL;
ALTER TABLE "project_chat_citations" ADD CONSTRAINT "project_chat_citations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "project_chat_messages"("id") ON DELETE CASCADE;
ALTER TABLE "project_chat_citations" ADD CONSTRAINT "project_chat_citations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "project_team_messages" ADD CONSTRAINT "project_team_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_team_messages" ADD CONSTRAINT "project_team_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "project_team_messages" ADD CONSTRAINT "project_team_messages_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "project_team_message_reads" ADD CONSTRAINT "project_team_message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "project_team_messages"("id") ON DELETE CASCADE;
ALTER TABLE "project_team_message_reads" ADD CONSTRAINT "project_team_message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "project_contribution_proposals" ADD CONSTRAINT "project_contribution_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "project_contribution_proposals" ADD CONSTRAINT "project_contribution_proposals_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "project_contribution_proposals" ADD CONSTRAINT "project_contribution_proposals_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "project_contribution_proposals" ADD CONSTRAINT "project_contribution_proposals_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "project_contribution_proposals" ADD CONSTRAINT "project_contribution_proposals_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "project_contribution_history" ADD CONSTRAINT "project_contribution_history_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "project_contribution_proposals"("id") ON DELETE CASCADE;
ALTER TABLE "project_contribution_history" ADD CONSTRAINT "project_contribution_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "communities" ADD CONSTRAINT "communities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE;
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_research_gap_id_fkey" FOREIGN KEY ("research_gap_id") REFERENCES "research_gaps"("id") ON DELETE SET NULL;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_linked_paper_id_fkey" FOREIGN KEY ("linked_paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_linked_research_gap_id_fkey" FOREIGN KEY ("linked_research_gap_id") REFERENCES "research_gaps"("id") ON DELETE SET NULL;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_linked_project_id_fkey" FOREIGN KEY ("linked_project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "forum_post_papers" ADD CONSTRAINT "forum_post_papers_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_post_papers" ADD CONSTRAINT "forum_post_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "forum_comments"("id") ON DELETE SET NULL;
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_accepted_comment_id_fkey" FOREIGN KEY ("accepted_comment_id") REFERENCES "forum_comments"("id") ON DELETE SET NULL;
ALTER TABLE "forum_references" ADD CONSTRAINT "forum_references_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_references" ADD CONSTRAINT "forum_references_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "forum_comments"("id") ON DELETE CASCADE;
ALTER TABLE "forum_references" ADD CONSTRAINT "forum_references_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "forum_comments"("id") ON DELETE CASCADE;
ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "forum_comments"("id") ON DELETE CASCADE;
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL;
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "recruitment_openings" ADD CONSTRAINT "recruitment_openings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "recruitment_openings" ADD CONSTRAINT "recruitment_openings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "recruitment_applications" ADD CONSTRAINT "recruitment_applications_opening_id_fkey" FOREIGN KEY ("opening_id") REFERENCES "recruitment_openings"("id") ON DELETE CASCADE;
ALTER TABLE "recruitment_applications" ADD CONSTRAINT "recruitment_applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "recruitment_applications" ADD CONSTRAINT "recruitment_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "recruitment_applications" ADD CONSTRAINT "recruitment_applications_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- Draft workspace.
ALTER TABLE "draft_workspaces" ADD CONSTRAINT "draft_workspaces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "draft_workspaces" ADD CONSTRAINT "draft_workspaces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "draft_workspace_members" ADD CONSTRAINT "draft_workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "draft_workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "draft_workspace_members" ADD CONSTRAINT "draft_workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "workspace_sections" ADD CONSTRAINT "workspace_sections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "draft_workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "workspace_sections" ADD CONSTRAINT "workspace_sections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "workspace_sections" ADD CONSTRAINT "workspace_sections_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "section_revisions" ADD CONSTRAINT "section_revisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "draft_workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "section_revisions" ADD CONSTRAINT "section_revisions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "workspace_sections"("id") ON DELETE CASCADE;
ALTER TABLE "section_revisions" ADD CONSTRAINT "section_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "workspace_comments" ADD CONSTRAINT "workspace_comments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "draft_workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "workspace_comments" ADD CONSTRAINT "workspace_comments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "workspace_sections"("id") ON DELETE CASCADE;
ALTER TABLE "workspace_comments" ADD CONSTRAINT "workspace_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "workspace_comments" ADD CONSTRAINT "workspace_comments_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- Reports, gaps, literature and quality.
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "reports" ADD CONSTRAINT "reports_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL;
ALTER TABLE "report_papers" ADD CONSTRAINT "report_papers_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
ALTER TABLE "report_papers" ADD CONSTRAINT "report_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "rag_queries" ADD CONSTRAINT "rag_queries_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
ALTER TABLE "rag_queries" ADD CONSTRAINT "rag_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "rag_query_results" ADD CONSTRAINT "rag_query_results_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "rag_queries"("id") ON DELETE CASCADE;
ALTER TABLE "rag_query_results" ADD CONSTRAINT "rag_query_results_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "gap_analyses" ADD CONSTRAINT "gap_analyses_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL;
ALTER TABLE "gap_analysis_papers" ADD CONSTRAINT "gap_analysis_papers_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "gap_analyses"("id") ON DELETE CASCADE;
ALTER TABLE "gap_analysis_papers" ADD CONSTRAINT "gap_analysis_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_source_report_id_fkey" FOREIGN KEY ("source_report_id") REFERENCES "reports"("id") ON DELETE SET NULL;
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "gap_analyses"("id") ON DELETE SET NULL;
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_corpus_id_fkey" FOREIGN KEY ("corpus_id") REFERENCES "literature_corpora"("id") ON DELETE SET NULL;
ALTER TABLE "research_gap_papers" ADD CONSTRAINT "research_gap_papers_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;
ALTER TABLE "research_gap_papers" ADD CONSTRAINT "research_gap_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "gap_directions" ADD CONSTRAINT "gap_directions_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;
ALTER TABLE "gap_directions" ADD CONSTRAINT "gap_directions_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL;
ALTER TABLE "gap_direction_items" ADD CONSTRAINT "gap_direction_items_directions_id_fkey" FOREIGN KEY ("directions_id") REFERENCES "gap_directions"("id") ON DELETE CASCADE;
ALTER TABLE "gap_direction_papers" ADD CONSTRAINT "gap_direction_papers_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "gap_direction_items"("id") ON DELETE CASCADE;
ALTER TABLE "gap_direction_papers" ADD CONSTRAINT "gap_direction_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "gap_evidence_records" ADD CONSTRAINT "gap_evidence_records_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;
ALTER TABLE "gap_evidence_records" ADD CONSTRAINT "gap_evidence_records_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "gap_evidence_records" ADD CONSTRAINT "gap_evidence_records_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "gap_validations" ADD CONSTRAINT "gap_validations_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;
ALTER TABLE "gap_validations" ADD CONSTRAINT "gap_validations_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "literature_corpora" ADD CONSTRAINT "literature_corpora_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "literature_corpora" ADD CONSTRAINT "literature_corpora_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "corpus_papers" ADD CONSTRAINT "corpus_papers_corpus_id_fkey" FOREIGN KEY ("corpus_id") REFERENCES "literature_corpora"("id") ON DELETE CASCADE;
ALTER TABLE "corpus_papers" ADD CONSTRAINT "corpus_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "corpus_papers" ADD CONSTRAINT "corpus_papers_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;

-- Submission, review, contribution and AI jobs.
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "submission_authors" ADD CONSTRAINT "submission_authors_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "submission_authors" ADD CONSTRAINT "submission_authors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "submission_declared_conflicts" ADD CONSTRAINT "submission_declared_conflicts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "submission_declared_conflicts" ADD CONSTRAINT "submission_declared_conflicts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "submission_revisions"("id") ON DELETE SET NULL;
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_pre_reviews" ADD CONSTRAINT "ai_pre_reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "ai_pre_reviews" ADD CONSTRAINT "ai_pre_reviews_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "review_templates"("id") ON DELETE CASCADE;
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "reviewer_assignments"("id") ON DELETE CASCADE;
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "submission_revisions"("id") ON DELETE RESTRICT;
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "review_templates"("id") ON DELETE SET NULL;
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "human_reviews"("id") ON DELETE CASCADE;
ALTER TABLE "research_contributions" ADD CONSTRAINT "research_contributions_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "research_contributions" ADD CONSTRAINT "research_contributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "research_contributions" ADD CONSTRAINT "research_contributions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL;
ALTER TABLE "research_contributions" ADD CONSTRAINT "research_contributions_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "research_contributions" ADD CONSTRAINT "research_contributions_source_review_assignment_id_fkey" FOREIGN KEY ("source_review_assignment_id") REFERENCES "reviewer_assignments"("id") ON DELETE SET NULL;
ALTER TABLE "research_contributions" ADD CONSTRAINT "research_contributions_source_project_contribution_id_fkey" FOREIGN KEY ("source_project_contribution_id") REFERENCES "project_contribution_proposals"("id") ON DELETE SET NULL;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "draft_workspaces"("id") ON DELETE SET NULL;
ALTER TABLE "ai_run_evidence" ADD CONSTRAINT "ai_run_evidence_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE CASCADE;

-- Credits, notifications and operational records.
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_refunded_transaction_id_fkey" FOREIGN KEY ("refunded_transaction_id") REFERENCES "credit_transactions"("id") ON DELETE SET NULL;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "mcp_tool_runs" ADD CONSTRAINT "mcp_tool_runs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL;
ALTER TABLE "mcp_tool_runs" ADD CONSTRAINT "mcp_tool_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "trend_explanations" ADD CONSTRAINT "trend_explanations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- Scholarly ingestion.
ALTER TABLE "api_sync_configs" ADD CONSTRAINT "api_sync_configs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "api_providers"("id") ON DELETE RESTRICT;
ALTER TABLE "api_sync_configs" ADD CONSTRAINT "api_sync_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "api_sync_runs" ADD CONSTRAINT "api_sync_runs_sync_config_id_fkey" FOREIGN KEY ("sync_config_id") REFERENCES "api_sync_configs"("id") ON DELETE SET NULL;
ALTER TABLE "api_sync_runs" ADD CONSTRAINT "api_sync_runs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "api_providers"("id") ON DELETE RESTRICT;
ALTER TABLE "openalex_ingest_partitions" ADD CONSTRAINT "openalex_ingest_partitions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "openalex_ingest_page_attempts" ADD CONSTRAINT "openalex_ingest_page_attempts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "openalex_ingest_page_attempts" ADD CONSTRAINT "openalex_ingest_page_attempts_partition_id_fkey" FOREIGN KEY ("partition_id") REFERENCES "openalex_ingest_partitions"("id") ON DELETE CASCADE;
ALTER TABLE "ingest_dead_letters" ADD CONSTRAINT "ingest_dead_letters_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "ingest_dead_letters" ADD CONSTRAINT "ingest_dead_letters_partition_id_fkey" FOREIGN KEY ("partition_id") REFERENCES "openalex_ingest_partitions"("id") ON DELETE SET NULL;
ALTER TABLE "ingest_dead_letters" ADD CONSTRAINT "ingest_dead_letters_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "openalex_ingest_page_attempts"("id") ON DELETE SET NULL;
ALTER TABLE "corpus_validation_runs" ADD CONSTRAINT "corpus_validation_runs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE CASCADE;
ALTER TABLE "openalex_refresh_watermarks" ADD CONSTRAINT "openalex_refresh_watermarks_last_campaign_id_fkey" FOREIGN KEY ("last_campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE SET NULL;
ALTER TABLE "paper_cohort_memberships" ADD CONSTRAINT "paper_cohort_memberships_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE;
ALTER TABLE "paper_cohort_memberships" ADD CONSTRAINT "paper_cohort_memberships_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "openalex_ingest_campaigns"("id") ON DELETE CASCADE;

-- Polymorphic targets and conditional business uniqueness.
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_exactly_one_target_check" CHECK (num_nonnulls("paper_id", "report_id") = 1);
CREATE UNIQUE INDEX "bookmarks_user_paper_unique" ON "bookmarks" ("user_id", "paper_id") WHERE "paper_id" IS NOT NULL;
CREATE UNIQUE INDEX "bookmarks_user_report_unique" ON "bookmarks" ("user_id", "report_id") WHERE "report_id" IS NOT NULL;

ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_exactly_one_target_check" CHECK (num_nonnulls("post_id", "comment_id") = 1);
ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_value_check" CHECK ("value" IN (-1, 1));
CREATE UNIQUE INDEX "forum_votes_user_post_unique" ON "forum_votes" ("user_id", "post_id") WHERE "post_id" IS NOT NULL;
CREATE UNIQUE INDEX "forum_votes_user_comment_unique" ON "forum_votes" ("user_id", "comment_id") WHERE "comment_id" IS NOT NULL;

ALTER TABLE "forum_references" ADD CONSTRAINT "forum_references_exactly_one_owner_check" CHECK (num_nonnulls("post_id", "comment_id") = 1);
ALTER TABLE "forum_content_reports" ADD CONSTRAINT "forum_content_reports_exactly_one_target_check" CHECK (num_nonnulls("post_id", "comment_id") = 1);
CREATE UNIQUE INDEX "forum_content_reports_open_post_unique" ON "forum_content_reports" ("reporter_id", "post_id") WHERE "post_id" IS NOT NULL AND "status" = 'open';
CREATE UNIQUE INDEX "forum_content_reports_open_comment_unique" ON "forum_content_reports" ("reporter_id", "comment_id") WHERE "comment_id" IS NOT NULL AND "status" = 'open';

ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_exactly_one_target_check" CHECK (num_nonnulls("paper_id", "report_id", "gap_id") = 1);
CREATE UNIQUE INDEX "quality_evaluations_paper_unique" ON "quality_evaluations" ("paper_id") WHERE "paper_id" IS NOT NULL;
CREATE UNIQUE INDEX "quality_evaluations_report_unique" ON "quality_evaluations" ("report_id") WHERE "report_id" IS NOT NULL;
CREATE UNIQUE INDEX "quality_evaluations_gap_unique" ON "quality_evaluations" ("gap_id") WHERE "gap_id" IS NOT NULL;

ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_exactly_one_target_check" CHECK (num_nonnulls("paper_id", "report_id", "gap_id") = 1);
CREATE UNIQUE INDEX "user_ratings_user_paper_unique" ON "user_ratings" ("user_id", "paper_id") WHERE "paper_id" IS NOT NULL;
CREATE UNIQUE INDEX "user_ratings_user_report_unique" ON "user_ratings" ("user_id", "report_id") WHERE "report_id" IS NOT NULL;
CREATE UNIQUE INDEX "user_ratings_user_gap_unique" ON "user_ratings" ("user_id", "gap_id") WHERE "gap_id" IS NOT NULL;

CREATE UNIQUE INDEX "project_contribution_active_unique" ON "project_contribution_proposals" ("project_id", "contributor_id") WHERE "status" IN ('PENDING_CONFIRMATION', 'CONFIRMING');
CREATE UNIQUE INDEX "research_contribution_project_source_unique" ON "research_contributions" ("source_project_contribution_id", "contribution_type") WHERE "source_project_contribution_id" IS NOT NULL;
CREATE UNIQUE INDEX "corpus_validation_active_key_unique" ON "corpus_validation_runs" ("active_key") WHERE "active_key" IS NOT NULL;

-- High-value invariants and exact repository enum values.
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('user','student','lecturer','researcher','reviewer','moderator','admin'));
ALTER TABLE "users" ADD CONSTRAINT "users_academic_profile_type_check" CHECK ("academic_profile_type" IS NULL OR "academic_profile_type" IN ('student','researcher','lecturer'));
ALTER TABLE "users" ADD CONSTRAINT "users_nonnegative_balances_check" CHECK ("credits" >= 0 AND "penalty_points" >= 0);
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_visibility_check" CHECK ("profile_visibility" IN ('PUBLIC','MEMBERS_ONLY','PRIVATE'));
ALTER TABLE "academic_profiles" ADD CONSTRAINT "academic_profiles_verification_status_check" CHECK ("verification_status" IN ('SELF_DECLARED','PENDING','VERIFIED','REJECTED'));
ALTER TABLE "papers" ADD CONSTRAINT "papers_kind_check" CHECK ("paper_kind" IN ('article','proceedings','preprint','review','book-chapter','other'));
ALTER TABLE "papers" ADD CONSTRAINT "papers_open_access_status_check" CHECK ("open_access_status" IN ('gold','green','hybrid','bronze','closed','unknown'));
ALTER TABLE "papers" ADD CONSTRAINT "papers_provider_check" CHECK ("primary_provider" IN ('openalex','semanticscholar','crossref','arxiv','user'));
ALTER TABLE "papers" ADD CONSTRAINT "papers_status_check" CHECK ("paper_status" IN ('pending','not-downloaded','downloaded','rejected','pending-requester-acceptance'));
ALTER TABLE "papers" ADD CONSTRAINT "papers_data_status_check" CHECK ("data_status" IN ('draft','active','low-quality','archived'));
ALTER TABLE "papers" ADD CONSTRAINT "papers_embedding_dimensions_check" CHECK ("embedding" IS NULL OR vector_dims("embedding") = 768);
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_role_check" CHECK ("role" IN ('owner','moderator','member'));
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_status_check" CHECK ("status" IN ('pending','active','declined','banned'));
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_type_check" CHECK ("type" IN ('charge','refund','reward'));
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "paper_quality_checks" ADD CONSTRAINT "paper_quality_checks_score_check" CHECK ("quality_score" BETWEEN 0 AND 1);
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5);
ALTER TABLE "quality_evaluations" ADD CONSTRAINT "quality_evaluations_scores_check" CHECK ("relevance" BETWEEN 1 AND 5 AND "groundedness" BETWEEN 1 AND 5 AND "completeness" BETWEEN 1 AND 5 AND "overall" BETWEEN 1 AND 5);
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_checksum_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_size_check" CHECK ("size_bytes" BETWEEN 1 AND 10485760);

-- PostgreSQL full-text search replaces MongoDB text indexes. These generated
-- columns are deterministic and cannot drift from title/body data.
-- PostgreSQL marks the generic array_to_string(anyarray, text) overload as
-- STABLE because arbitrary element types can have locale-sensitive output.
-- Our community topics are already text[], so this narrow wrapper is safely
-- immutable and can participate in a generated column.
CREATE FUNCTION "lumigap_text_array_to_string"(values_to_join text[], separator text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURN array_to_string(values_to_join, separator);

ALTER TABLE "papers" DROP COLUMN "search_document";
ALTER TABLE "papers" ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("abstract_text", '')), 'B')
) STORED;
CREATE INDEX "papers_search_document_gin" ON "papers" USING GIN ("search_document");

ALTER TABLE "communities" DROP COLUMN "search_document";
ALTER TABLE "communities" ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('simple', "lumigap_text_array_to_string"("research_topics", ' ')), 'B')
) STORED;
CREATE INDEX "communities_search_document_gin" ON "communities" USING GIN ("search_document");

-- Exact vector search is the safe initial behavior. An HNSW/IVFFlat index is
-- intentionally deferred until corpus size and pgvector version are verified.
