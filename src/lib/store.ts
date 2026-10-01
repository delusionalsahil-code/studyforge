import { useSyncExternalStore } from "react";
import type { SolutionOut } from "./ai/schemas";
import { configureAi, DEFAULT_AI, type AiSettings } from "./ai/client";
import type { ClassIds } from "./classification";
import { EMPTY_IDS } from "./classification";
import type { SrsState, Rating } from "./srs";
import { buildTaxonomy, seedRows, type NodeRow, type Taxonomy } from "./taxonomy";
import type { Difficulty } from "./taxonomy-types";

/* ------------------------------- entities ------------------------------- */
export type ProcStatus = "queued" | "processing" | "completed" | "failed" | "duplicate_pending";

export interface Trick {
  id: string;
  name: string;
  explanation: string;
  whenItWorks: string;
  whyItWorks: string;
  limitations: string;
  normalMethod: string;
  shortcutMethod: string;
  validityCheck: string;
}
export interface Mistake {
  id: string;
  category: string;
  title: string;
  description: string;
  preventionTip: string;
}
export interface StoredSolution {
  content: SolutionOut;
  finalAnswer: string;
  verified: boolean;
  verificationNotes: string;
  hints: string[];
  model: string;
  createdAt: string;
}
export interface Analysis {
  classification?: { stage1: unknown; stage2: unknown };
  solution?: unknown;
  verification?: unknown;
  formulas?: unknown;
  tricks?: unknown;
}
export interface Question {
  id: string;
  importId: string | null;
  originalText: string;
  normalizedText: string;
  textHash: string;
  sourceType: "text" | "image" | "pdf" | "ai_generated";
  sourceName: string | null;
  sourcePage: string | null;
  imageUploadId: string | null;
  pdfUploadId: string | null;
  isAiGenerated: boolean;
  generatedFromId: string | null;
  isSample: boolean;
  processingStatus: ProcStatus;
  processingStage: string;
  processingError: string | null;
  processingErrorCode: string | null;
  duplicateOfId: string | null;
  duplicateScore: number | null;
  ids: ClassIds;
  difficulty: Difficulty | null;
  difficultyConfidence: number | null;
  classificationConfidence: number | null;
  levelConfidence: Record<string, number>;
  classificationSource: "ai" | "user" | null;
  reviewReasons: string[];
  suggestions: Record<string, string[]>;
  solutionStatus: "pending" | "verified" | "unverified";
  aiVerified: boolean;
  needsReview: boolean;
  hasTrick: boolean;
  tags: string[];
  formulaIds: string[];
  analysis: Analysis;
  solution: StoredSolution | null;
  tricks: Trick[];
  mistakes: Mistake[];
  createdAt: string;
  updatedAt: string;
}
export interface FormulaVar {
  symbol: string;
  meaning: string;
  unit: string;
}
export interface Formula {
  id: string;
  canonicalKey: string;
  name: string;
  expression: string;
  latex: string;
  variables: FormulaVar[];
  units: string;
  whenToUse: string;
  restrictions: string;
  subjectId: number | null;
  chapterId: number | null;
  topicId: number | null;
  subtopicId: number | null;
  conceptIds: number[];
  createdAt: string;
}
export interface RevState extends SrsState {
  questionId: string;
  dueAt: string;
  lastRating: Rating | null;
  lastReviewedAt: string | null;
}
export interface ReviewEvent {
  id: string;
  questionId: string;
  rating: Rating;
  hintsUsed: number;
  timeSpentSec: number;
  intervalDays: number;
  dueAt: string;
  at: string;
}
export interface ClassificationEvent {
  id: string;
  questionId: string;
  kind: "ai" | "user";
  at: string;
  ids: ClassIds;
  difficulty: Difficulty | null;
  confidence: Record<string, number>;
  reasons: string[];
}
export interface GeneratedQuestion {
  id: string;
  fromId: string;
  mode: string;
  text: string;
  variation: string;
  expectedAnswer: string;
  solutionOutline: string;
  savedQuestionId: string | null;
  createdAt: string;
}
export interface ImportJob {
  id: string;
  sourceType: "text" | "image" | "pdf";
  sourceName: string | null;
  sourcePage: string | null;
  rawText: string | null;
  uploadId: string | null;
  splitMultiple: boolean;
  status: "queued" | "processing" | "completed" | "failed";
  stage: string;
  error: string | null;
  errorCode: string | null;
  questionCount: number;
  createdAt: string;
}
export interface Upload {
  id: string;
  filename: string;
  mime: string;
  dataUrl: string;
  size: number;
  createdAt: string;
}
export interface Settings extends AiSettings {
  defaultExam: string;
  defaultClass: string;
  theme: "light" | "dark" | "system";
  dailyGoal: number;
}

export interface DB {
  version: 1;
  nodes: NodeRow[];
  nextNodeId: number;
  questions: Question[];
  formulas: Formula[];
  revision: Record<string, RevState>;
  reviews: ReviewEvent[];
  classEvents: ClassificationEvent[];
  generated: GeneratedQuestion[];
  imports: ImportJob[];
  embeddings: Record<string, number[]>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { ...DEFAULT_AI, defaultExam: "JEE Main", defaultClass: "Class 12", theme: "system", dailyGoal: 15 };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const nowIso = () => new Date().toISOString();

function freshDB(): DB {
  const { rows, nextId } = seedRows();
  return {
    version: 1,
    nodes: rows,
    nextNodeId: nextId,
    questions: [],
    formulas: [],
    revision: {},
    reviews: [],
    classEvents: [],
    generated: [],
    imports: [],
    embeddings: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function newQuestion(p: Partial<Question> & Pick<Question, "originalText" | "normalizedText" | "textHash" | "sourceType">): Question {
  const t = nowIso();
  return {
    id: uid(),
    importId: null,
    sourceName: null,
    sourcePage: null,
    imageUploadId: null,
    pdfUploadId: null,
    isAiGenerated: false,
    generatedFromId: null,
    isSample: false,
    processingStatus: "queued",
    processingStage: "queued",
    processingError: null,
    processingErrorCode: null,
    duplicateOfId: null,
    duplicateScore: null,
    ids: { ...EMPTY_IDS, conceptIds: [] },
    difficulty: null,
    difficultyConfidence: null,
    classificationConfidence: null,
    levelConfidence: {},
    classificationSource: null,
    reviewReasons: [],
    suggestions: {},
    solutionStatus: "pending",
    aiVerified: false,
    needsReview: false,
    hasTrick: false,
    tags: [],
    formulaIds: [],
    analysis: {},
    solution: null,
    tricks: [],
    mistakes: [],
    createdAt: t,
    updatedAt: t,
    ...p,
  };
}

/* ------------------------------- persistence ------------------------------ */
const DB_NAME = "studyforge";
const STORE = "kv";
let idb: IDBDatabase | null = null;
export let persistenceMode: "indexeddb" | "memory" = "memory";

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
function idbGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (!idb) return resolve(undefined);
    const r = idb.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => resolve(undefined);
  });
}
function idbPut(key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    if (!idb) return resolve(false);
    try {
      const tx = idb.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

let db: DB = freshDB();
let uploads: Record<string, Upload> = {};
let uploadsDirty = false;
let version = 0;
let ready = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export let lastSaveError: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function initStore(): Promise<void> {
  idb = await openIdb();
  if (idb) {
    persistenceMode = "indexeddb";
    const saved = await idbGet<DB>("main");
    const up = await idbGet<Record<string, Upload>>("uploads");
    if (saved && saved.version === 1) db = { ...freshDB(), ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings } };
    if (up) uploads = up;
  }
  // anything left "processing" by a closed tab is retryable, never silently lost
  for (const q of db.questions) {
    if (q.processingStatus === "processing") {
      q.processingStatus = "failed";
      q.processingError = "Processing was interrupted (the page was closed). Retry to resume from the last completed stage.";
      q.processingErrorCode = "INTERRUPTED";
    }
  }
  for (const i of db.imports) {
    if (i.status === "processing") {
      i.status = "failed";
      i.error = "Processing was interrupted. Retry to continue.";
      i.errorCode = "INTERRUPTED";
    }
  }
  configureAi(db.settings);
  applyTheme(db.settings.theme);
  ready = true;
  version++;
  emit();
}

async function flush() {
  saveTimer = null;
  if (!idb) return;
  const ok = await idbPut("main", db);
  if (ok && uploadsDirty) {
    uploadsDirty = false;
    await idbPut("uploads", uploads);
  }
  lastSaveError = ok ? null : "Could not save to browser storage (it may be full). Export a backup from Settings.";
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      void flush();
    }
  });
}

/** Mutate the database; subscribers re-render and the change is persisted. */
export function mutate<T>(fn: (d: DB) => T): T {
  const r = fn(db);
  version++;
  scheduleSave();
  emit();
  return r;
}
export const getDB = () => db;
export const isReady = () => ready;

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
/** Subscribe to the database; returns the (mutable) db — it re-renders on every change. */
export function useDB(): DB {
  useSyncExternalStore(subscribe, () => version);
  return db;
}

/* ------------------------------- uploads -------------------------------- */
export function saveUpload(u: Omit<Upload, "id" | "createdAt">): Upload {
  const up: Upload = { ...u, id: uid(), createdAt: nowIso() };
  uploads[up.id] = up;
  uploadsDirty = true;
  scheduleSave();
  return up;
}
export const getUpload = (id: string | null | undefined): Upload | undefined => (id ? uploads[id] : undefined);
export function deleteUpload(id: string) {
  delete uploads[id];
  uploadsDirty = true;
  scheduleSave();
}

/* ------------------------------- taxonomy ------------------------------- */
let taxCache: { nodes: NodeRow[]; stamp: number; tax: Taxonomy } | null = null;
let nodeStamp = 0;
export function getTax(): Taxonomy {
  if (!taxCache || taxCache.nodes !== db.nodes || taxCache.stamp !== nodeStamp) {
    taxCache = { nodes: db.nodes, stamp: nodeStamp, tax: buildTaxonomy(db.nodes) };
  }
  return taxCache.tax;
}
export const bumpTaxonomy = () => {
  nodeStamp++;
};
export function useTax(): Taxonomy {
  useDB();
  return getTax();
}

/* ------------------------------ settings/theme --------------------------- */
export function applyTheme(theme: Settings["theme"]) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function updateSettings(patch: Partial<Settings>) {
  mutate((d) => {
    d.settings = { ...d.settings, ...patch };
    configureAi(d.settings);
  });
  if (patch.theme) applyTheme(patch.theme);
}

/* ------------------------------ backup / reset --------------------------- */
export function exportBackup(includeKey = false): string {
  const copy = { ...db, embeddings: {}, settings: { ...db.settings, apiKey: includeKey ? db.settings.apiKey : "" } };
  return JSON.stringify({ app: "studyforge", exportedAt: nowIso(), db: copy, uploads }, null, 0);
}
export function importBackup(json: string) {
  const parsed = JSON.parse(json) as { app?: string; db?: DB; uploads?: Record<string, Upload> };
  if (parsed.app !== "studyforge" || !parsed.db || parsed.db.version !== 1) throw new Error("This file is not a StudyForge backup.");
  const keepKey = db.settings.apiKey;
  mutate((d) => {
    Object.assign(d, { ...freshDB(), ...parsed.db, settings: { ...DEFAULT_SETTINGS, ...parsed.db!.settings, apiKey: parsed.db!.settings?.apiKey || keepKey } });
    uploads = parsed.uploads ?? {};
    uploadsDirty = true;
    configureAi(d.settings);
  });
  nodeStamp++;
}
export function resetAll() {
  const keep = db.settings;
  mutate((d) => {
    Object.assign(d, freshDB(), { settings: keep });
    uploads = {};
    uploadsDirty = true;
  });
  nodeStamp++;
}
