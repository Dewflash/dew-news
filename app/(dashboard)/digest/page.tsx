import { createServiceClient } from "@/lib/supabase/server";
import { DigestClient } from "@/components/digest/DigestClient";

export default async function DigestPage() {
  const supabase = createServiceClient();

  const { data: summaries, error } = await supabase
    .from("summaries")
    .select("*")
    .order("period_start", { ascending: false });
  if (error) throw new Error(error.message);

  const weekly = (summaries ?? []).filter((s) => s.type === "weekly");
  const monthly = (summaries ?? []).filter((s) => s.type === "monthly");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Digest</h1>
      <DigestClient weekly={weekly} monthly={monthly} />
    </div>
  );
}
