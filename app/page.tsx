import Portal from "@/components/Portal";
import { getConstituencyDetail, getLocationMeta } from "@/lib/data";

const DEFAULT_AC = 161; // C.V. Raman Nagar (the fully-featured POC seat)

export default async function HomePage() {
  // Only the default seat's detail is loaded server-side; constituency
  // boundaries are loaded by the map per-viewport, and other seats' candidate
  // data is fetched on click.
  const detail = await getConstituencyDetail(DEFAULT_AC);
  const location = getLocationMeta();

  return <Portal initialDetail={detail!} initialAc={DEFAULT_AC} location={location} />;
}
