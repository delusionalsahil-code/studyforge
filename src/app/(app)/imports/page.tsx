import Link from "next/link";
import { ImportsLive } from "@/components/ImportsLive";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Processing" };

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUser();
  const { new: ids } = await searchParams;
  return (
    <>
      <PageHeader
        title="Processing & imports"
        subtitle="Live status of every upload: extracting → classifying → solving → formulas → tricks → saving."
        actions={
          <Link href="/add" className="btn btn-primary">
            ＋ Add more
          </Link>
        }
      />
      <ImportsLive highlight={(ids ?? "").split(",").filter(Boolean)} />
    </>
  );
}
