import { after } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { imports, questions, uploads } from "@/db/schema";
import { ApiError, json, route0 } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { runImportJob } from "@/lib/pipeline";
import { sha256 } from "@/lib/text";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 10;

function sniff(buf: Buffer): { kind: "image" | "pdf"; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", mime: "image/png" };
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { kind: "image", mime: "image/webp" };
  if (buf.subarray(0, 4).toString() === "GIF8") return { kind: "image", mime: "image/gif" };
  if (buf.subarray(0, 5).toString() === "%PDF-") return { kind: "pdf", mime: "application/pdf" };
  return null;
}

/** Creates import jobs for pasted text and/or uploaded images / PDFs. Processing continues in the background. */
export const POST = route0(async (req) => {
  const user = await apiUser();
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Could not read the upload. Please try again.", "VALIDATION");
  });
  const text = String(form.get("text") ?? "").trim();
  const sourceName = String(form.get("sourceName") ?? "").trim().slice(0, 120) || null;
  const sourcePage = String(form.get("sourcePage") ?? "").trim().slice(0, 30) || null;
  const multi = form.get("multi") === "true";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pasted = form.get("pasted") === "true";

  if (!text && !files.length) throw new ApiError(400, "Paste a question or choose an image / PDF first.", "VALIDATION");
  if (text.length > 30_000) throw new ApiError(400, "That text is too long (max 30,000 characters).", "VALIDATION");
  if (files.length > MAX_FILES) throw new ApiError(400, `Upload at most ${MAX_FILES} files at once.`, "VALIDATION");

  // validate everything before storing anything
  const prepared: { file: File; buf: Buffer; kind: "image" | "pdf"; mime: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new ApiError(413, `"${file.name}" is larger than 15 MB.`, "FILE_TOO_LARGE");
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) throw new ApiError(415, `"${file.name}" is not a valid image (JPEG, PNG, WebP, GIF) or PDF.`, "UNSUPPORTED_FILE");
    prepared.push({ file, buf, ...kind });
  }

  const ids: string[] = [];
  if (text) {
    const [row] = await db
      .insert(imports)
      .values({ userId: user.id, sourceType: "text", sourceName, sourcePage, rawText: text, splitMultiple: multi, stage: "uploaded" })
      .returning({ id: imports.id });
    ids.push(row.id);
  }
  for (const p of prepared) {
    const hash = sha256(p.buf);
    const [existing] = await db.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.userId, user.id), eq(uploads.sha256, hash))).limit(1);
    const uploadId =
      existing?.id ??
      (
        await db
          .insert(uploads)
          .values({ userId: user.id, filename: (p.file.name || (pasted ? "pasted-image" : "upload")).slice(0, 200), mime: p.mime, size: p.buf.length, sha256: hash, data: p.buf })
          .returning({ id: uploads.id })
      )[0].id;
    const [row] = await db
      .insert(imports)
      .values({ userId: user.id, sourceType: p.kind, sourceName: sourceName ?? (p.file.name || null), sourcePage, uploadId, splitMultiple: true, stage: "uploaded" })
      .returning({ id: imports.id });
    ids.push(row.id);
  }

  after(async () => {
    for (const id of ids) await runImportJob(id);
  });
  return json({ importIds: ids }, 202);
});

/** Recent imports with their questions (polled by the processing view). */
export const GET = route0(async () => {
  const user = await apiUser();
  const imps = await db.select().from(imports).where(eq(imports.userId, user.id)).orderBy(desc(imports.createdAt)).limit(15);
  const qs = imps.length
    ? await db
        .select({
          id: questions.id,
          importId: questions.importId,
          text: questions.originalText,
          status: questions.processingStatus,
          stage: questions.processingStage,
          error: questions.processingError,
          errorCode: questions.processingErrorCode,
          heartbeatAt: questions.heartbeatAt,
          duplicateOfId: questions.duplicateOfId,
          duplicateScore: questions.duplicateScore,
          needsReview: questions.needsReview,
        })
        .from(questions)
        .where(and(eq(questions.userId, user.id), inArray(questions.importId, imps.map((i) => i.id))))
        .orderBy(questions.createdAt)
    : [];
  const dupIds = [...new Set(qs.map((q) => q.duplicateOfId).filter((x): x is string => Boolean(x)))];
  const dupTexts = dupIds.length
    ? await db.select({ id: questions.id, text: questions.originalText }).from(questions).where(and(eq(questions.userId, user.id), inArray(questions.id, dupIds)))
    : [];
  const dupMap = new Map(dupTexts.map((d) => [d.id, d.text.slice(0, 300)]));
  const stale = Date.now() - 5 * 60_000;
  return json({
    imports: imps.map((i) => ({
      id: i.id,
      sourceType: i.sourceType,
      sourceName: i.sourceName,
      status: i.status,
      stage: i.stage,
      error: i.error,
      errorCode: i.errorCode,
      createdAt: i.createdAt,
      stale: i.status === "processing" && i.heartbeatAt.getTime() < stale,
      questions: qs
        .filter((q) => q.importId === i.id)
        .map((q) => ({ ...q, text: q.text.slice(0, 400), duplicateText: q.duplicateOfId ? (dupMap.get(q.duplicateOfId) ?? null) : null, stale: q.status === "processing" && q.heartbeatAt.getTime() < stale })),
    })),
  });
});

