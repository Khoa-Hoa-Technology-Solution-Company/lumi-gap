import type { PrismaClient } from "../src/generated/prisma/client.js";

type SeedUser = { id: string };
type SeedPost = { type: "QUESTION" | "DISCUSSION" | "PAPER_DISCUSSION" | "RESEARCH_GAP_DISCUSSION"; title: string; body: string; tags: string[]; author: "lecturer" | "student"; pinned?: boolean };
type SeedCommunity = {
  slug: string;
  name: string;
  researchField: string;
  icon: string;
  visibility: "public" | "private";
  status?: "ACTIVE" | "PENDING_APPROVAL";
  description: string;
  rules: string[];
  researchTopics: string[];
  studentMembership?: "active" | "pending";
  adminMember?: boolean;
  posts: SeedPost[];
};

const COMMUNITIES: SeedCommunity[] = [
  {
    slug: "machine-learning-ai",
    name: "Machine Learning & AI",
    researchField: "Artificial Intelligence",
    icon: "brain",
    visibility: "public",
    description: "Discuss learning algorithms, model evaluation and applied AI, from classical machine learning to large language models.",
    rules: ["Cite the paper or dataset behind factual claims", "Report evaluation setups so results can be compared", "Keep critique constructive and specific", "No self-promotion without a reproducible artifact"],
    researchTopics: ["machine learning", "deep learning", "transformers", "reinforcement learning", "model evaluation"],
    studentMembership: "active",
    adminMember: true,
    posts: [
      { type: "DISCUSSION", title: "Welcome: how to ask a good research question here", body: "Share the task, the data you used and what you already tried. Link the papers you are building on so others can check the evidence.", tags: ["guidelines"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "How should I compare two models when the test set is small?", body: "We have about 400 labeled examples. Is a paired bootstrap enough, or should we move to repeated cross-validation with a significance test?", tags: ["evaluation", "statistics"], author: "student" },
      { type: "PAPER_DISCUSSION", title: "Are instruction-tuned models really better at reasoning benchmarks?", body: "Several recent results report large gains. What controls would convince you the gain is reasoning and not benchmark contamination?", tags: ["llm", "benchmarks"], author: "lecturer" },
    ],
  },
  {
    slug: "natural-language-processing",
    name: "Natural Language Processing",
    researchField: "Computer Science",
    icon: "message-square",
    visibility: "public",
    description: "Language models, information extraction, low-resource languages and text mining for scientific literature.",
    rules: ["Name the language and dataset when sharing results", "Use standard metrics before proposing new ones", "Respect licences of shared corpora"],
    researchTopics: ["nlp", "language models", "information extraction", "low-resource languages", "text mining"],
    studentMembership: "active",
    adminMember: true,
    posts: [
      { type: "DISCUSSION", title: "Vietnamese NLP resources worth knowing", body: "Let's keep a living list of corpora, tokenizers and evaluation sets for Vietnamese. Please add licence and size when you post one.", tags: ["vietnamese", "resources"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "Best way to evaluate keyphrase extraction on scientific abstracts?", body: "Exact match penalizes valid paraphrases. Has anyone compared semantic matching with human judgments on abstracts?", tags: ["keyphrase", "evaluation"], author: "student" },
    ],
  },
  {
    slug: "computer-vision",
    name: "Computer Vision",
    researchField: "Computer Science",
    icon: "eye",
    visibility: "public",
    description: "Recognition, detection, segmentation and multimodal models, with an emphasis on reproducible experiments.",
    rules: ["State image resolution and augmentation used", "Share code or configs when claiming a new result", "Credit dataset authors"],
    researchTopics: ["computer vision", "object detection", "image segmentation", "multimodal learning", "medical imaging"],
    posts: [
      { type: "DISCUSSION", title: "Start here: reproducibility checklist for vision papers", body: "Seeds, augmentation, train/validation splits and hardware all change results. Use this thread to propose items for a shared checklist.", tags: ["reproducibility"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "Why does my detector drop sharply on night-time images?", body: "Trained on daytime traffic scenes, accuracy falls by half at night. Domain adaptation or simply more night data?", tags: ["detection", "domain-shift"], author: "lecturer" },
    ],
  },
  {
    slug: "software-engineering-research",
    name: "Software Engineering Research",
    researchField: "Software Engineering",
    icon: "code",
    visibility: "public",
    description: "Empirical software engineering, testing, code review, mining repositories and developer productivity.",
    rules: ["Describe the sampling of projects or participants", "Flag threats to validity", "Do not share confidential industry data"],
    researchTopics: ["software engineering", "software testing", "code review", "empirical study", "mining software repositories"],
    studentMembership: "active",
    posts: [
      { type: "DISCUSSION", title: "Threats to validity: what reviewers actually check", body: "Post examples of threats-to-validity sections that were accepted, and what you would change. Internal, external, construct and conclusion validity welcome.", tags: ["methodology"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "How many repositories are enough for a mining study?", body: "We sampled 120 GitHub projects. Is there a principled way to justify the sample size beyond 'what we could process'?", tags: ["mining", "sampling"], author: "student" },
      { type: "PAPER_DISCUSSION", title: "Does automated code review actually reduce defects?", body: "Looking for field studies, not just tool benchmarks. What outcome measures were used?", tags: ["code-review", "defects"], author: "lecturer" },
    ],
  },
  {
    slug: "data-science-analytics",
    name: "Data Science & Analytics",
    researchField: "Data Science",
    icon: "bar-chart",
    visibility: "public",
    description: "Statistical modelling, data quality, visualization and analytics pipelines for research data.",
    rules: ["Share data provenance and cleaning steps", "Prefer open datasets when asking for help", "Show uncertainty, not only point estimates"],
    researchTopics: ["data science", "statistics", "data visualization", "data quality", "time series"],
    adminMember: true,
    posts: [
      { type: "DISCUSSION", title: "Data cleaning log template for papers", body: "A short, reusable template for documenting what was removed or imputed, and why. Suggestions welcome.", tags: ["data-quality"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "Choosing between ARIMA and a neural forecaster for yearly publication counts", body: "Only 20 data points per topic. Is a neural model defensible here or is it overfitting by construction?", tags: ["forecasting", "time-series"], author: "lecturer" },
    ],
  },
  {
    slug: "educational-technology",
    name: "Educational Technology",
    researchField: "Education",
    icon: "graduation-cap",
    visibility: "public",
    description: "Learning analytics, AI tutors, assessment and technology-enhanced teaching in higher education.",
    rules: ["Protect student privacy in every example", "Distinguish pilots from large-scale evidence", "Declare conflicts of interest with vendors"],
    researchTopics: ["educational technology", "learning analytics", "intelligent tutoring", "assessment", "higher education"],
    studentMembership: "active",
    posts: [
      { type: "DISCUSSION", title: "Evidence on AI tutors: what do we actually know?", body: "Let's collect controlled studies and effect sizes, and separate engagement from measured learning gains.", tags: ["ai-tutor", "evidence"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "Ethical approval for analysing LMS logs", body: "Do logs collected for course administration need fresh consent when reused for a research paper?", tags: ["ethics", "learning-analytics"], author: "student" },
    ],
  },
  {
    slug: "knowledge-graphs",
    name: "Knowledge Graphs",
    researchField: "Computer Science",
    icon: "share-2",
    visibility: "private",
    description: "A closed group for ongoing work on academic knowledge graphs, entity linking and graph-based retrieval. Membership is by request.",
    rules: ["Work-in-progress stays inside the group", "Credit collaborators when sharing results", "Ask before forwarding unpublished data"],
    researchTopics: ["knowledge graphs", "entity linking", "graph neural networks", "ontology", "scholarly data"],
    studentMembership: "pending",
    posts: [
      { type: "DISCUSSION", title: "Schema decisions for the scholarly graph", body: "Working thread on how to model authors, venues and topics so that citation queries stay fast.", tags: ["schema", "scholarly-data"], author: "lecturer", pinned: true },
      { type: "QUESTION", title: "Entity linking for author names with transliteration", body: "Vietnamese names appear with and without diacritics. What blocking strategy works best before pairwise matching?", tags: ["entity-linking"], author: "lecturer" },
    ],
  },
  {
    slug: "quantum-computing-research",
    name: "Quantum Computing for Research",
    researchField: "Physics",
    icon: "atom",
    visibility: "public",
    status: "PENDING_APPROVAL",
    description: "Proposed space for quantum algorithms and their use in optimisation and simulation. Waiting for administrator approval.",
    rules: ["Distinguish simulated from hardware results", "State qubit counts and noise assumptions"],
    researchTopics: ["quantum computing", "quantum algorithms", "optimisation", "simulation"],
    posts: [],
  },
];

const slugOf = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Idempotent: communities are keyed by a fixed slug, memberships by (community, user) and
 * posts by (community, title). Re-running converges to the same data and counters.
 */
export async function seedCommunities(prisma: PrismaClient, users: { lecturer: SeedUser; student: SeedUser; admin: SeedUser }): Promise<void> {
  for (const seed of COMMUNITIES) {
    const status = seed.status ?? "ACTIVE";
    const community = await prisma.community.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug, name: seed.name, description: seed.description, researchField: seed.researchField, icon: seed.icon,
        researchTopics: seed.researchTopics, rules: seed.rules, visibility: seed.visibility, status, ownerId: users.lecturer.id,
      },
      update: {
        name: seed.name, description: seed.description, researchField: seed.researchField, icon: seed.icon,
        researchTopics: seed.researchTopics, rules: seed.rules, visibility: seed.visibility, status, ownerId: users.lecturer.id,
      },
    });

    const memberships: Array<{ userId: string; role: "owner" | "member"; status: "active" | "pending" }> = [{ userId: users.lecturer.id, role: "owner", status: "active" }];
    if (seed.studentMembership) memberships.push({ userId: users.student.id, role: "member", status: seed.studentMembership });
    if (seed.adminMember) memberships.push({ userId: users.admin.id, role: "member", status: "active" });
    for (const membership of memberships) {
      await prisma.communityMembership.upsert({
        where: { communityId_userId: { communityId: community.id, userId: membership.userId } },
        create: { communityId: community.id, ...membership },
        update: { role: membership.role, status: membership.status },
      });
    }

    const authors = { lecturer: users.lecturer.id, student: users.student.id };
    for (const post of seed.posts) {
      const existing = await prisma.forumPost.findFirst({ where: { communityId: community.id, title: post.title }, select: { id: true } });
      const data = { type: post.type, body: post.body, tags: post.tags, isPinned: Boolean(post.pinned), pinnedAt: post.pinned ? new Date() : null };
      const saved = existing
        ? await prisma.forumPost.update({ where: { id: existing.id }, data })
        : await prisma.forumPost.create({ data: { ...data, title: post.title, authorId: authors[post.author], communityId: community.id } });
      for (const tag of post.tags) {
        const row = await prisma.forumTag.upsert({ where: { slug: slugOf(tag) }, create: { name: tag, slug: slugOf(tag) }, update: {} });
        await prisma.forumPostTag.upsert({ where: { postId_tagId: { postId: saved.id, tagId: row.id } }, create: { postId: saved.id, tagId: row.id }, update: {} });
      }
    }

    const [memberCount, threadCount] = await Promise.all([
      prisma.communityMembership.count({ where: { communityId: community.id, status: "active" } }),
      prisma.forumPost.count({ where: { communityId: community.id, status: { not: "deleted" } } }),
    ]);
    await prisma.community.update({ where: { id: community.id }, data: { memberCount, threadCount } });
  }
}
