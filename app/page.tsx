import Portal from "@/components/Portal";
import {
  getAllConstituenciesGeoJson,
  getConstituencyDetail,
  getLocationMeta,
} from "@/lib/data";

const DEFAULT_AC = 161; // C.V. Raman Nagar (the fully-featured POC seat)

export default async function HomePage() {
  const [geojson, detail] = await Promise.all([
    getAllConstituenciesGeoJson(),
    getConstituencyDetail(DEFAULT_AC),
  ]);
  const location = getLocationMeta();

  return (
    <Portal
      geojson={geojson}
      initialDetail={detail!}
      initialAc={DEFAULT_AC}
      location={location}
    />
  );
}
