# Software Requirements Specification (SRS)
## Domain: Discovery & Personalization (Dev 1)

---

## 1. Introduction

### 1.1 Purpose
This document provides a detailed specification of the Software Requirements for the **Discovery & Personalization** domains of the **LiemResearch** platform. It outlines the functional and non-functional requirements, database schemas, and architectural boundaries governing scientific publication discovery, search filtering, paper metadata, user bookmarking, note annotation, and customized user profiles.

### 1.2 Scope
The scope of the Discovery & Personalization domain includes:
*   **Semantic and Keyword Search**: Supporting conceptual/semantic queries powered by vector embeddings alongside traditional keyword indexes.
*   **Paper Detail & Metric Views**: Showcasing metadata, quality scores, open-access status, citations copy-actions, and referencing AI reports.
*   **Bookmarks & Annotation Library**: Organizing saved documents with custom metadata, folder categorization, and annotation editing.
*   **User Profiles & Interest Tags**: Personalized recommendations based on academic roles and subject domains.
*   **Interactive Dashboard KPIs**: Live system volume metrics and shortcuts.

---

## 2. Overall Description

### 2.1 User Classes and Characteristics
The platform caters to four distinct user classes:
1.  **Student (Sinh viên)**: Focuses on search discovery, bookmarking papers for literature review, and generating basic summaries.
2.  **Lecturer (Giảng viên)**: Utilizes advanced filters, saves papers, reads AI trend reports, and views research gaps to advise students.
3.  **Researcher (Nhà nghiên cứu)**: Employs deep semantic analysis, exports APA citations, annotates bookmarks with notes, and tracks paper publication velocity.
4.  **Admin (Quản trị viên)**: Monitors query logs, runs data sync operations, and manages system analytics dashboards.

### 2.2 Design and Implementation Constraints
*   **Data Isolation**: Bookmark annotations and private notes are restricted strictly to the owning user.
*   **Rate Limits**: Report generations are throttled to prevent daily Gemini API quota exhaustion.
*   **Database Constraints**: All collection definitions must follow Mongoose schema models matching `@trend/shared-types`.

---

## 3. System Features (Functional Requirements)

### 3.1 Feature: Semantic & Keyword Search
#### 3.1.1 Description
Users can search across thousands of publication indexes using two modes:
1.  **Semantic Mode**: Computes the vector embedding of the user's query via the Gemini embedding provider and runs an Atlas Vector Search to match papers conceptually.
2.  **Keyword Mode**: Uses MongoDB native `$text` index to search matches of exact phrases or words, acting as a fallback when API keys expire or when keyword matches are preferred.

#### 3.1.2 Functional Requirements
*   **FR-SR-1 (Search Switcher)**: The UI must offer a toggle to switch between "Semantic" and "Keyword" search.
*   **FR-SR-2 (Year Filters)**: Users can filter publications within a custom year range (e.g. 2020 - 2026).
*   **FR-SR-3 (Open Access Toggle)**: A filter toggle to restrict results strictly to open-access publications (where `openAccessUrl` is present).
*   **FR-SR-4 (Journal Type Filter)**: Multiple checkboxes to filter by publication kinds (`proceedings`, `article`, `preprint`).
*   **FR-SR-5 (Source Select)**: Dropdown option to filter by data provider (`OpenAlex`, `Crossref`).
*   **FR-SR-6 (AI Similarity Threshold)**: A range slider (0.0 to 1.0) allowing users to filter semantic search results below a defined relevance score.
*   **FR-SR-7 (Fallback Mode & Diagnostics)**:
    *   If a semantic search query fails due to an expired/invalid `GEMINI_API_KEY`, the backend must return a structured error with code `GEMINI_API_KEY_ERROR`.
    *   The frontend must intercept this error, render a prominent warning banner explaining the issue, and provide a one-click button to fallback to Keyword Search Mode.
    *   A Vietnamese-guided step list must be toggleable to show the user how to configure a new key in `apps/backend/.env`.

---

### 3.2 Feature: Paper Details & AI Insights
#### 3.2.1 Description
Displays comprehensive information of a single scientific paper and formats citations.

#### 3.2.2 Functional Requirements
*   **FR-PD-1 (Metadata Display)**: Renders title, authors (with initial avatars), journal name, publication year, open access badge, and external DOI link.
*   **FR-PD-2 (Metrics Analysis)**: Displays visual progress bars representing Relevance, Semantic Fit, and Metadata Quality scores based on AI assessment.
*   **FR-PD-3 (Bookmark Toggle)**: A button allowing the user to save or unsave the paper, calling the bookmarks API seamlessly.
*   **FR-PD-4 (APA Cite Copy)**: A "Cite" button that compiles authors, year, title, and journal into an APA style string, copies it to the clipboard, and triggers a toast notification.
*   **FR-PD-5 (AI Reports Card)**:
    *   A sidebar widget displaying the count of AI reports that cite this specific paper.
    *   The count is fetched from `GET /api/v1/reports/paper/:paperId/count` (a public endpoint).
    *   Clicking the widget navigates the user to the `/reports` directory.

---

### 3.3 Feature: Bookmarks & Library
#### 3.3.1 Description
Allows authenticated users to organize saved resources and append private note comments.

#### 3.3.2 Functional Requirements
*   **FR-BK-1 (Categorized Tabs)**: The `/bookmarks` workspace classifies saved items into tabs: All Items, Papers, and Reports.
*   **FR-BK-2 (Bookmark Search)**: An inline input box allows users to filter saved bookmarks by topic or paper title client-side.
*   **FR-BK-3 (Private Note Annotation)**: Users can attach or modify a private text comment to any bookmark.
    *   *Constraint*: The comment note has a maximum validation limit of **500 characters**.
*   **FR-BK-4 (Quick Bookmark)**: Search result cards on `/search` include inline bookmark toggles to quickly save/unsave papers directly.

---

### 3.4 Feature: Dynamic Home Stats & Shortcuts
#### 3.4.1 Description
Updates home page counters and adds navigation entry points.

#### 3.4.2 Functional Requirements
*   **FR-HS-1 (Dynamic Counts)**: Replaces hardcoded counters with live data:
    *   *Papers Indexed*: Total count of research documents.
    *   *Searches*: Total searches logged in database, fetched via `GET /analytics/search/summary`.
    *   *Saved Papers*: The user's active bookmark count.
*   **FR-HS-2 (KPI Card Redirect)**: The "SAVED PAPERS" KPI card is interactive, showing a pointer cursor on hover and navigating to `/bookmarks` when clicked.
*   **FR-HS-3 (Header Bookmarks Icon)**: A dedicated bookmark icon with a notification-style badge displaying the count of bookmarks is integrated next to the notification bell in the header.

---

## 4. Data Requirements & Database Schema

### 4.1 Bookmarks Collection Schema
```ts
// Collection: bookmarks
{
  _id:        ObjectId,
  userId:     ObjectId, ref: "User", required: true,
  targetKind: String, enum: ["paper", "report"], required: true,
  targetId:   ObjectId, required: true,
  note:       String, maxlength: 500, default: ""
  createdAt:  Date,
  updatedAt:  Date
}
```

### 4.2 Database Indexes
To maintain database integrity and ensure efficient queries:
*   **Compound Unique Index**: `{ userId: 1, targetKind: 1, targetId: 1 }`
    *   *Purpose*: Restricts duplicates, preventing a user from saving the same paper or report multiple times.
*   **Index on User ID**: `{ userId: 1 }`
    *   *Purpose*: Fast loading of a user's entire library page.

---

## 5. Non-Functional Requirements

### 5.1 Usability
*   The UI must support both light and dark modes with harmonized HSL color palettes.
*   Interactive elements (buttons, KPI cards, sidebar widgets) must support micro-animations and distinct hover changes.

### 5.2 Performance & Caching
*   Bookmarked items must be queried in a single request on page load and stored in memory for O(1) lookups during card rendering to avoid performance degradation.
*   Public count requests must load asynchronously to avoid delaying core page rendering.
