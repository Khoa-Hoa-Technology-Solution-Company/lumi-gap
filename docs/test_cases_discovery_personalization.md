# Test Cases Specification
## Domain: Discovery & Personalization (Dev 1)

---

## 1. Introduction & Scope
This document outlines the system verification test suite for the **Discovery & Personalization** domains of the **LiemResearch** platform. The tests cover manual UI verification, API payload validity, validation constraints, and error diagnostic fallback operations.

---

## 2. Test Environment Setup
*   **Database**: MongoDB Atlas (`publication_trend` database, seeded with 541 research papers).
*   **Local Backend Server**: Running on `http://localhost:4000`.
*   **Local Frontend Web**: Running on `http://localhost:5173`.
*   **Diagnostic Tools**: Chrome Developer Tools (F12) ➔ Network and Console tabs.

---

## 3. Test Cases Suite

### 3.1 Test Suite 1: Authentication & User Profile Settings

#### TC1.1: User Registration
*   **Objective**: Verify a user can register a new account.
*   **Steps**:
    1. Navigate to `http://localhost:5173/register`.
    2. Fill in Full Name, Email, Password, and Confirm Password.
    3. Click **Sign up**.
*   **Expected Result**: User is redirected to `http://localhost:5173/login`, and a success toast alert appears.
*   **Verification**: Check MongoDB `users` collection to confirm the user document exists with a hashed password.

#### TC1.2: User Login & Session Persistence
*   **Objective**: Verify login and access token storage.
*   **Steps**:
    1. Navigate to `http://localhost:5173/login`.
    2. Input registered Email and Password, click **Sign in**.
*   **Expected Result**: Redirects to `/home`. User name is visible in the top navigation bar header.
*   **Verification**: DevTools ➔ Application ➔ Local Storage contains active JWT token credentials.

#### TC1.3: Update User Interest Tags & Profile
*   **Objective**: Verify selection and saving of profile research interest tags.
*   **Steps**:
    1. Navigate to `http://localhost:5173/profile`.
    2. Select multiple tags in the interest selector (e.g. `Machine Learning`, `NLP`).
    3. Click **Save Interests**.
*   **Expected Result**: Page triggers `PUT /api/v1/auth/me` with interest tag array, showing a success notification.
*   **Verification**: Reload `/profile` ➔ Selected interest tags persist.

---

### 3.2 Test Suite 2: Search & Discovery Filters

#### TC2.1: Semantic Search Mode
*   **Objective**: Verify Vector search yields conceptually relevant papers.
*   **Steps**:
    1. Navigate to `/search`. Select **Semantic** mode.
    2. Input query: `"AI tools in learning and instruction"`. Press Enter.
*   **Expected Result**: Search yields papers containing terms like "ChatGPT", "educational technology", and "intelligent tutoring systems", even if they do not contain the exact query string.
*   **Verification**: DevTools ➔ Network shows payload query sent to `/api/v1/search` with similarity scores $> 0.0$.

#### TC2.2: Keyword Search Mode
*   **Objective**: Verify keyword text matching works.
*   **Steps**:
    1. On `/search`, select **Keyword** mode.
    2. Input query: `"Transformers"`. Press Enter.
*   **Expected Result**: Results display publications having "Transformers" in the title or abstract. Quality score displays "N/A" (correct, as keyword index does not have vector distance scores).

#### TC2.3: Publication Year Range Filtering
*   **Objective**: Verify year boundary constraints filter out older/newer documents.
*   **Steps**:
    1. Perform a search.
    2. In the sidebar, set **Publication Year** from `2024` to `2026`.
*   **Expected Result**: The list dynamically filters, and all displayed papers show publication years $\ge 2024$ and $\le 2026$.

#### TC2.4: AI Score Similarity Threshold
*   **Objective**: Verify the range slider filters low-relevance papers.
*   **Steps**:
    1. Run a semantic search.
    2. Adjust the **AI Score Threshold** slider to `0.90`.
*   **Expected Result**: All displayed papers list similarity scores $\ge 0.90$.

---

### 3.3 Test Suite 3: Paper Detail Page & Citations

#### TC3.1: Copy Citation APA Formatting
*   **Objective**: Verify citation text compilation and clipboard copying.
*   **Steps**:
    1. Click on a paper title to open `/papers/:id`.
    2. Click the **Cite** button.
*   **Expected Result**: Clipboard contains compiled citation: `Author (Year). Title. Journal.`. Toast alert displays: `"APA Citation copied to clipboard!"`.
*   **Verification**: Paste clipboard contents into a notepad to confirm formatting.

#### TC3.2: AI Reports Cited Count
*   **Objective**: Verify count widget sidebar displays AI report citations.
*   **Steps**:
    1. Open a paper detail page.
    2. Inspect the **AI Reports** sidebar widget count.
*   **Expected Result**: Displays the correct count of AI reports citing this paper.
*   **Verification**: DevTools ➔ Network confirms request to `/reports/paper/:paperId/count` returns successfully.

---

### 3.4 Test Suite 4: Bookmarks & Library Notes

#### TC4.1: Quick Bookmarking from Search Results
*   **Objective**: Toggle bookmarks directly from cards.
*   **Steps**:
    1. Perform a search at `/search`.
    2. Click the **Bookmark icon** on a result card.
*   **Expected Result**: Icon state changes immediately. Navigating to `/bookmarks` displays the saved paper in the list.

#### TC4.2: Library Tabs Filtering & Search
*   **Objective**: Verify bookmarks can be categorized and filtered.
*   **Steps**:
    1. Open `/bookmarks`.
    2. Click **Papers** tab ➔ only saved papers show. Click **Reports** tab ➔ only reports show.
    3. Type a query in **Search saved items...** input.
*   **Expected Result**: Saved items filter client-side matching the query string.

#### TC4.3: Note Annotation Length Boundary Constraints
*   **Objective**: Validate note annotation characters boundary check.
*   **Steps**:
    1. Click the edit note action on any bookmark.
    2. Try typing/pasting a string exceeding **500 characters**.
*   **Expected Result**: The interface either blocks input at 500 characters, or triggers a validation error message preventing save.
*   **Verification**: Check API response: `POST /bookmarks/:id/note` returns an error if over 500 characters.

---

### 3.5 Test Suite 5: Fallback & API Key Diagnostics

#### TC5.1: Expired Gemini API Key Fallback
*   **Objective**: Verify system recovers gracefully when vector search fails.
*   **Steps**:
    1. Configure an invalid `GEMINI_API_KEY` in `apps/backend/.env`.
    2. Run a semantic search at `/search`.
*   **Expected Result**:
    *   Search page displays a glassmorphic red warning banner notifying about the expired key.
    *   Vietnamese configuration instructions are toggleable.
    *   A button labeled **"Chuyển sang Tìm kiếm Từ khóa (Keyword Mode)"** is visible.
    *   Clicking it shifts search mode to **Keyword**, executing text search correctly and rendering results.
