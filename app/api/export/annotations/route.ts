import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { annotationExportToCsv, buildAnnotationExport } from "@/lib/export";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const rows = await buildAnnotationExport();

  if (format === "csv") {
    return new NextResponse(annotationExportToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="annotations.csv"',
      },
    });
  }

  return new NextResponse(JSON.stringify(rows, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="annotations.json"',
    },
  });
}
