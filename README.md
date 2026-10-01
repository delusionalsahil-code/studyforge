# Arjuna — AI Question Bank, Solution Generator, Formula Vault & Adaptive Revision

Next.js (App Router) · TypeScript · Tailwind · PostgreSQL (Drizzle ORM). Built for JEE; the taxonomy lives in the database so CBSE/other curricula can be added without code changes.

## Configure
Copy `.env.example`. The AI layer is OpenAI-compatible and strictly server-side: set `AI_API_KEY` (and optionally `AI_BASE_URL`, `AI_MODEL`, `AI_EMBEDDING_MODEL`). Without a key the app still works (library, taxonomy, revision), and analysis stops with a clear, retryable error.
The first registered account (or any email in `ADMIN_EMAILS`) is the administrator and can edit the taxonomy at `/admin/taxonomy`.

## Architecture
- `src/db/schema.ts` — relational model: taxonomy tables (curricula, exams, classes, subjects, units, chapters, subchapters, topics, subtopics, concepts, question_types, tags), questions with FK classification, solutions, formulas (+links), tricks, mistakes, revision state/events, embeddings, uploads (bytea), imports, classification history.
- `src/lib/taxonomy*.ts` — loader, ancestor index, admin ops, default JEE seed (seeded automatically on first use; DB is then the source of truth).
- `src/lib/classification.ts` — maps AI names to canonical taxonomy rows (no new spellings), validates parent/child compatibility, per-level confidence, `needs_review` rules.
- `src/lib/ai/*` — schema-validated structured outputs (zod) with one automatic repair attempt; malformed output is rejected, never stored.
- `src/lib/pipeline.ts` — import → extraction → classify (2 hierarchical calls) → solve → independent verification → formulas → tricks & mistakes → atomic save. Every stage output is persisted so a retry resumes at the failed stage without duplicating the question.
- `src/lib/srs.ts` — adaptive spaced repetition (Day 1/3/7/14/30 ladder + ease, lapses, hints, time).
- Security: cookie sessions (scrypt, hashed tokens), every query is scoped by `user_id`, uploads are served only to their owner, admin routes require role `admin`, AI keys never reach the client.
