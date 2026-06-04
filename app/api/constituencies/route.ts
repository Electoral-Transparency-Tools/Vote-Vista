import { NextResponse } from "next/server";
import { getConstituenciesInBBox } from "@/lib/data";

export const runtime = "nodejs";

// GET /api/constituencies?bbox=minLng,minLat,maxLng,maxLat
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bbox = searchParams.get("bbox");
  if (!bbox) {
    return NextResponse.json({ error: "bbox required" }, { status: 400 });
  }
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  const fc = await getConstituenciesInBBox(minLng, minLat, maxLng, maxLat);
  return NextResponse.json(fc, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
