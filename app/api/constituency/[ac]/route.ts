import { NextResponse } from "next/server";
import { getConstituencyDetail } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { ac: string } },
) {
  const ac = Number(params.ac);
  if (!Number.isInteger(ac)) {
    return NextResponse.json({ error: "Invalid constituency" }, { status: 400 });
  }
  const detail = await getConstituencyDetail(ac);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
