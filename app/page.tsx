import Portal from "@/components/Portal";
import {
  getCandidatesFile,
  getWinningParty,
  getLocationMeta,
  getConstituencyGeoJson,
} from "@/lib/data";

export default async function HomePage() {
  const [file, winningParty, geojson] = await Promise.all([
    getCandidatesFile(),
    getWinningParty(),
    getConstituencyGeoJson(),
  ]);
  const location = getLocationMeta();

  return (
    <Portal
      constituency={file.constituency}
      candidates={file.candidates}
      winningParty={winningParty}
      geojson={geojson as GeoJSON.FeatureCollection}
      location={location}
    />
  );
}
