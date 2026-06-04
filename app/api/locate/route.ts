import { NextResponse } from "next/server";
import { getConstituencyAtPoint } from "@/lib/data";

export const runtime = "nodejs";

// GET /api/locate?lat=..&lng=..  -> { ac: number | null }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }
  const ac = await getConstituencyAtPoint(lat, lng);
  return NextResponse.json({ ac });
}
