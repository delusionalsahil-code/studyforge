import {
  type AnyPgColumn,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const tstz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tstz("created_at").notNull().defaultNow();
const updatedAt = () =>
  tstz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Taxonomy: every entity has id, (parent_id), name, slug, description, */
/* order_index, active, created_at, updated_at                          */
/* ------------------------------------------------------------------ */
const taxCols = () => ({
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const curricula = pgTable(
  "curricula",
  { ...taxCols() },
  (t) => [uniqueIndex("curricula_slug_uq").on(t.slug)],
);

export const exams = pgTable(
  "exams",
  {
    ...taxCols(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("exams_slug_uq").on(t.parentId, t.slug)],
);

export const classes = pgTable(
  "classes",
  { ...taxCols() },
  (t) => [uniqueIndex("classes_slug_uq").on(t.slug)],
);

export const subjects = pgTable(
  "subjects",
  {
    ...taxCols(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("subjects_slug_uq").on(t.parentId, t.slug)],
);

export const units = pgTable(
  "units",
  {
    ...taxCols(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("units_slug_uq").on(t.parentId, t.slug)],
);

/** parent_id = unit (optional: some subjects have no unit layer). subject_id is always set. */
export const chapters = pgTable(
  "chapters",
  {
    ...taxCols(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references(() => units.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("chapters_slug_uq").on(t.subjectId, t.slug), index("chapters_parent_idx").on(t.parentId)],
);

export const subchapters = pgTable(
  "subchapters",
  {
    ...taxCols(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("subchapters_slug_uq").on(t.parentId, t.slug)],
);

/** parent_id = subchapter (optional). chapter_id is always set. */
export const topics = pgTable(
  "topics",
  {
    ...taxCols(),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references(() => subchapters.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("topics_slug_uq").on(t.chapterId, t.slug), index("topics_parent_idx").on(t.parentId)],
);

export const subtopics = pgTable(
  "subtopics",
  {
    ...taxCols(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("subtopics_slug_uq").on(t.parentId, t.slug)],
);

/** A concept hangs off a subtopic, a topic or directly off a chapter. */
export const concepts = pgTable(
  "concepts",
  {
    ...taxCols(),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "cascade" }),
    subtopicId: integer("subtopic_id").references(() => subtopics.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("concepts_slug_uq").on(t.chapterId, t.slug),
    index("concepts_topic_idx").on(t.topicId),
    index("concepts_subtopic_idx").on(t.subtopicId),
  ],
);

export const questionTypes = pgTable(
  "question_types",
  { ...taxCols() },
  (t) => [uniqueIndex("question_types_slug_uq").on(t.slug)],
);

export const tags = pgTable("tags", { ...taxCols() }, (t) => [uniqueIndex("tags_slug_uq").on(t.slug)]);

/* ------------------------------------------------------------------ */
/* Users / auth                                                         */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user"), // user | admin
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    dailyGoal: integer("daily_goal").notNull().default(15),
    defaultExamId: integer("default_exam_id").references(() => exams.id, { onDelete: "set null" }),
    defaultClassId: integer("default_class_id").references(() => classes.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Uploads + imports (original content is never destroyed)             */
/* ------------------------------------------------------------------ */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_user_idx").on(t.userId, t.sha256)],
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // text | image | pdf
    sourceName: text("source_name"),
    sourcePage: text("source_page"),
    uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
    rawText: text("raw_text"),
    splitMultiple: boolean("split_multiple").notNull().default(false),
    status: text("status").notNull().default("queued"), // queued | processing | completed | failed
    stage: text("stage").notNull().default("uploaded"),
    error: text("error"),
    errorCode: text("error_code"),
    questionCount: integer("question_count").notNull().default(0),
    heartbeatAt: tstz("heartbeat_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("imports_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Questions                                                            */
/* ------------------------------------------------------------------ */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),

    originalText: text("original_text").notNull().default(""),
    normalizedText: text("normalized_text").notNull().default(""),
    textHash: text("text_hash").notNull().default(""),
    sourceType: text("source_type").notNull().default("text"), // text | image | pdf | ai_generated
    sourceName: text("source_name"),
    sourcePage: text("source_page"),
    imageUploadId: uuid("image_upload_id").references(() => uploads.id, { onDelete: "set null" }),
    pdfUploadId: uuid("pdf_upload_id").references(() => uploads.id, { onDelete: "set null" }),
    notes: text("notes"),

    // Deep classification (all foreign keys into taxonomy tables)
    classId: integer("class_id").references(() => classes.id),
    examId: integer("exam_id").references(() => exams.id),
    subjectId: integer("subject_id").references(() => subjects.id),
    unitId: integer("unit_id").references(() => units.id),
    chapterId: integer("chapter_id").references(() => chapters.id),
    subchapterId: integer("subchapter_id").references(() => subchapters.id),
    topicId: integer("topic_id").references(() => topics.id),
    subtopicId: integer("subtopic_id").references(() => subtopics.id),
    conceptId: integer("concept_id").references(() => concepts.id),
    questionTypeId: integer("question_type_id").references(() => questionTypes.id),
    difficulty: text("difficulty"), // Easy | Medium | Hard | Very Hard
    difficultyConfidence: real("difficulty_confidence"),
    perceivedDifficulty: text("perceived_difficulty"),
    classificationConfidence: real("classification_confidence"),
    levelConfidence: jsonb("level_confidence").$type<Record<string, number>>().notNull().default({}),
    classificationSource: text("classification_source").notNull().default("ai"), // ai | user
    userCorrectedAt: tstz("user_corrected_at"),
    reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default([]),

    solutionStatus: text("solution_status").notNull().default("pending"), // pending | verified | unverified | failed
    aiVerified: boolean("ai_verified").notNull().default(false),
    needsReview: boolean("needs_review").notNull().default(false),
    hasTrick: boolean("has_trick").notNull().default(false),

    processingStatus: text("processing_status").notNull().default("queued"), // queued | processing | completed | failed | duplicate_pending
    processingStage: text("processing_stage").notNull().default("queued"),
    processingError: text("processing_error"),
    processingErrorCode: text("processing_error_code"),
    heartbeatAt: tstz("heartbeat_at").notNull().defaultNow(),
    duplicateOfId: uuid("duplicate_of_id").references((): AnyPgColumn => questions.id, { onDelete: "set null" }),
    duplicateScore: real("duplicate_score"),

    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    generatedFromId: uuid("generated_from_id").references((): AnyPgColumn => questions.id, { onDelete: "set null" }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("questions_user_idx").on(t.userId, t.createdAt),
    index("questions_user_hash_idx").on(t.userId, t.textHash),
    index("questions_user_status_idx").on(t.userId, t.processingStatus),
    index("questions_subject_idx").on(t.subjectId),
    index("questions_unit_idx").on(t.unitId),
    index("questions_chapter_idx").on(t.chapterId),
    index("questions_subchapter_idx").on(t.subchapterId),
    index("questions_topic_idx").on(t.topicId),
    index("questions_subtopic_idx").on(t.subtopicId),
    index("questions_concept_idx").on(t.conceptId),
    index("questions_difficulty_idx").on(t.difficulty),
    index("questions_type_idx").on(t.questionTypeId),
  ],
);

/** Intermediate, validated AI outputs so a failed pipeline can resume without redoing work. */
export const questionAnalysis = pgTable("question_analysis", {
  questionId: uuid("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  classification: jsonb("classification").$type<Record<string, unknown>>(),
  solution: jsonb("solution").$type<Record<string, unknown>>(),
  verification: jsonb("verification").$type<Record<string, unknown>>(),
  formulas: jsonb("formulas").$type<Record<string, unknown>>(),
  tricks: jsonb("tricks").$type<Record<string, unknown>>(),
  model: text("model"),
  updatedAt: updatedAt(),
});

/** Immutable AI classification + every user correction (before/after). */
export const classificationEvents = pgTable(
  "classification_events",
  {
    id: serial("id").primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // ai | user_correction | user_confirmation
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("class_events_q_idx").on(t.questionId, t.createdAt)],
);

export const solutions = pgTable(
  "solutions",
  {
    id: serial("id").primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // numerical | theory | proof
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    finalAnswer: text("final_answer").notNull(),
    verification: jsonb("verification").$type<Record<string, unknown>>(),
    verified: boolean("verified").notNull().default(false),
    hints: jsonb("hints").$type<string[]>().notNull().default([]),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("solutions_question_uq").on(t.questionId)],
);

export const questionTags = pgTable(
  "question_tags",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.tagId] }), index("question_tags_tag_idx").on(t.tagId)],
);

export const questionConcepts = pgTable(
  "question_concepts",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    conceptId: integer("concept_id")
      .notNull()
      .references(() => concepts.id),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.conceptId] }), index("question_concepts_concept_idx").on(t.conceptId)],
);

/* ------------------------------------------------------------------ */
/* Formula vault, tricks, mistakes                                      */
/* ------------------------------------------------------------------ */
export type FormulaVariable = { symbol: string; meaning: string; unit?: string };

export const formulas = pgTable(
  "formulas",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalKey: text("canonical_key").notNull(),
    name: text("name").notNull(),
    expression: text("expression").notNull(),
    latex: text("latex").notNull().default(""),
    variables: jsonb("variables").$type<FormulaVariable[]>().notNull().default([]),
    units: text("units").notNull().default(""),
    whenToUse: text("when_to_use").notNull().default(""),
    restrictions: text("restrictions").notNull().default(""),
    subjectId: integer("subject_id").references(() => subjects.id),
    chapterId: integer("chapter_id").references(() => chapters.id),
    topicId: integer("topic_id").references(() => topics.id),
    subtopicId: integer("subtopic_id").references(() => subtopics.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("formulas_user_key_uq").on(t.userId, t.canonicalKey),
    index("formulas_user_chapter_idx").on(t.userId, t.chapterId),
  ],
);

export const formulaConcepts = pgTable(
  "formula_concepts",
  {
    formulaId: integer("formula_id")
      .notNull()
      .references(() => formulas.id, { onDelete: "cascade" }),
    conceptId: integer("concept_id")
      .notNull()
      .references(() => concepts.id),
  },
  (t) => [primaryKey({ columns: [t.formulaId, t.conceptId] })],
);

export const questionFormulas = pgTable(
  "question_formulas",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    formulaId: integer("formula_id")
      .notNull()
      .references(() => formulas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.formulaId] }), index("question_formulas_formula_idx").on(t.formulaId)],
);

export const tricks = pgTable(
  "tricks",
  {
    id: serial("id").primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    explanation: text("explanation").notNull(),
    whenItWorks: text("when_it_works").notNull().default(""),
    whyItWorks: text("why_it_works").notNull().default(""),
    limitations: text("limitations").notNull().default(""),
    normalMethod: text("normal_method").notNull().default(""),
    shortcutMethod: text("shortcut_method").notNull().default(""),
    validityCheck: text("validity_check").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("tricks_user_idx").on(t.userId), index("tricks_question_idx").on(t.questionId)],
);

export const commonMistakes = pgTable(
  "common_mistakes",
  {
    id: serial("id").primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("other"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    preventionTip: text("prevention_tip").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("mistakes_user_idx").on(t.userId, t.category), index("mistakes_question_idx").on(t.questionId)],
);

/* ------------------------------------------------------------------ */
/* Revision                                                             */
/* ------------------------------------------------------------------ */
export const revisionState = pgTable(
  "revision_state",
  {
    questionId: uuid("question_id")
      .primaryKey()
      .references(() => questions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueAt: tstz("due_at").notNull(),
    intervalDays: real("interval_days").notNull().default(1),
    ease: real("ease").notNull().default(2.5),
    step: integer("step").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    status: text("status").notNull().default("new"), // new | learning | review | mastered
    lastRating: text("last_rating"),
    lastReviewedAt: tstz("last_reviewed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [index("revision_state_due_idx").on(t.userId, t.dueAt)],
);

export const revisionEvents = pgTable(
  "revision_events",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // again | hard | good | easy | mastered
    solved: boolean("solved").notNull().default(false),
    hintsUsed: integer("hints_used").notNull().default(0),
    timeSpentSec: integer("time_spent_sec").notNull().default(0),
    intervalBefore: real("interval_before"),
    intervalAfter: real("interval_after"),
    nextDueAt: tstz("next_due_at"),
    createdAt: createdAt(),
  },
  (t) => [index("revision_events_user_idx").on(t.userId, t.createdAt), index("revision_events_q_idx").on(t.questionId)],
);

export const mistakeOccurrences = pgTable(
  "mistake_occurrences",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mistakeId: integer("mistake_id")
      .notNull()
      .references(() => commonMistakes.id, { onDelete: "cascade" }),
    eventId: integer("event_id")
      .notNull()
      .references(() => revisionEvents.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("mistake_occ_user_idx").on(t.userId, t.mistakeId)],
);

/* ------------------------------------------------------------------ */
/* Embeddings + AI generated practice                                   */
/* ------------------------------------------------------------------ */
export const questionEmbeddings = pgTable("question_embeddings", {
  questionId: uuid("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
  model: text("model").notNull(),
  createdAt: createdAt(),
});

export const generatedQuestions = pgTable(
  "generated_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceQuestionId: uuid("source_question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    variation: text("variation").notNull(),
    expectedAnswer: text("expected_answer").notNull().default(""),
    solutionOutline: text("solution_outline").notNull().default(""),
    savedQuestionId: uuid("saved_question_id").references(() => questions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("generated_user_src_idx").on(t.userId, t.sourceQuestionId)],
);
