import { AddQuestionForm } from "@/components/AddQuestionForm";
import { PageHeader } from "@/components/ui";
import { aiConfigured } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add question" };

export default async function AddPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Add questions" subtitle="Paste, type, drop a screenshot, snap a photo or upload a PDF. Every question is classified, solved and scheduled for revision automatically." />
      <div className="max-w-3xl">
        <AddQuestionForm aiReady={aiConfigured()} />
      </div>
    </>
  );
}
