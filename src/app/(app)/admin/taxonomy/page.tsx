import { PageHeader } from "@/components/ui";
import { TaxonomyAdmin, type AdminNode } from "@/components/TaxonomyAdmin";
import { requireAdminPage } from "@/lib/auth";
import { loadTaxonomy } from "@/lib/taxonomy";
import type { Level } from "@/lib/taxonomy-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taxonomy manager" };

export default async function AdminTaxonomyPage() {
  await requireAdminPage();
  const tax = await loadTaxonomy(true);
  const nodes: AdminNode[] = (Object.keys(tax.byLevel) as Level[]).flatMap((l) =>
    tax.byLevel[l].map((n) => ({ level: n.level, id: n.id, name: n.name, description: n.description, orderIndex: n.orderIndex, active: n.active, parent: n.parent })),
  );
  return (
    <>
      <PageHeader title="Taxonomy manager" subtitle="Curriculum → Subject → Unit → Chapter → Subchapter → Topic → Subtopic → Concept. This tree is the single source of truth the AI must choose from; it never invents categories." />
      <TaxonomyAdmin nodes={nodes} />
    </>
  );
}
