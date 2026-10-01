import { isDue, isMastered, isWeak } from "../lib/queries";
import { Link } from "../lib/router";
import type { Question } from "../lib/store";
import { useDB, useTax } from "../lib/store";
import { pathText } from "../lib/taxonomy";
import { truncate } from "../lib/text";
import { Rich } from "./Rich";
import { Badge, DifficultyBadge, Spinner } from "./ui";

export function QuestionCard({ q }: { q: Question }) {
  const db = useDB();
  const tax = useTax();
  const rs = db.revision[q.id];
  const type = tax.get("question_type", q.ids.questionTypeId)?.name;
  const path = pathText(tax, q.ids);
  const busy = q.processingStatus === "processing" || q.processingStatus === "queued";
  return (
    <Link to={`/questions/${q.id}`} className="card block !p-4 transition-colors hover:border-brand/50">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {busy && (
          <Badge tone="brand">
            <Spinner className="h-3 w-3" /> Analysing
          </Badge>
        )}
        {q.processingStatus === "failed" && <Badge tone="bad">Analysis failed</Badge>}
        {q.processingStatus === "completed" && <DifficultyBadge value={q.difficulty} />}
        {type && <Badge>{type}</Badge>}
        {q.hasTrick && <Badge tone="good">Shortcut</Badge>}
        {q.needsReview && <Badge tone="warn">Needs review</Badge>}
        {q.isAiGenerated && <Badge tone="brand">AI-generated</Badge>}
        {q.isSample && <Badge>Sample</Badge>}
        {rs && isMastered(rs) && <Badge tone="good">Mastered</Badge>}
        {rs && isWeak(rs) && <Badge tone="bad">Weak</Badge>}
        {rs && isDue(rs) && <Badge tone="warn">Due</Badge>}
      </div>
      <div className="line-clamp-3 text-sm leading-relaxed">
        <Rich text={truncate(q.originalText, 320)} />
      </div>
      <div className="mt-2.5 truncate text-xs text-muted">{path || (q.processingStatus === "completed" ? "Unclassified" : "Classification pending")}</div>
    </Link>
  );
}
