import Portal from "@/components/Portal";
import {
  getConstituencyAtPoint,
  getConstituencyDetail,
  getLocationMeta,
} from "@/lib/data";

const FALLBACK_AC = 161; // used only if the provided location can't be resolved

export default async function HomePage() {
  const location = getLocationMeta();

  // First load shows the candidate data for the user's provided location
  // (the configured house coordinates). The browser may override this with a
  // live geolocation fix on the client.
  const houseAc = await getConstituencyAtPoint(
    location.poc_location.lat,
    location.poc_location.lon,
  );
  const initialAc = houseAc ?? FALLBACK_AC;
  const detail = await getConstituencyDetail(initialAc);

  return <Portal initialDetail={detail!} initialAc={initialAc} location={location} />;
}
