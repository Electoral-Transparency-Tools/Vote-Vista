import Portal from "@/components/Portal";
import {
  getCandidatesFile,
  getWinningParty,
  getLocationMeta,
  getConstituencyGeoJson,
} from "@/lib/data";

export default function HomePage() {
  const file = getCandidatesFile();
  const winningParty = getWinningParty();
  const location = getLocationMeta();
  const geojson = getConstituencyGeoJson() as GeoJSON.FeatureCollection;

  return (
    <Portal
      constituency={file.constituency}
      candidates={file.candidates}
      winningParty={winningParty}
      geojson={geojson}
      location={location}
    />
  );
}
