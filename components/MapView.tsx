"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import { partyColor } from "@/lib/format";

interface MapViewProps {
  geojson: GeoJSON.FeatureCollection;
  house: { lat: number; lon: number; label: string };
  selectedAc: number | null;
  onSelect: (ac: number) => void;
}

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function extendBounds(b: maplibregl.LngLatBounds, geom: GeoJSON.Geometry) {
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates]
      : geom.type === "MultiPolygon"
        ? geom.coordinates
        : [];
  for (const poly of polys as number[][][][]) {
    for (const ring of poly) for (const c of ring) b.extend([c[0], c[1]]);
  }
}

export default function MapView({ geojson, house, selectedAc, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Inject a per-feature fill color based on the winning party.
    const colored: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: geojson.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          color: partyColor(String(f.properties?.winner_party_short ?? "")),
        },
      })),
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [house.lon, house.lat],
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("cons", { type: "geojson", data: colored });
      map.addLayer({
        id: "cons-fill",
        type: "fill",
        source: "cons",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "cons-line",
        type: "line",
        source: "cons",
        paint: { "line-color": "#334155", "line-width": 0.8, "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "cons-selected",
        type: "line",
        source: "cons",
        filter: ["==", ["get", "ac_no"], selectedAc ?? -1],
        paint: { "line-color": "#0f172a", "line-width": 3.5 },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "cons-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f) {
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${f.properties?.ac_name ?? ""}</strong><br/>${
                f.properties?.winning_candidate
                  ? `Won by ${f.properties.winning_candidate} (${f.properties.winner_party_short})`
                  : ""
              }`,
            )
            .addTo(map);
        }
      });
      map.on("mouseleave", "cons-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "cons-fill", (e) => {
        const ac = e.features?.[0]?.properties?.ac_no;
        if (ac != null) onSelectRef.current(Number(ac));
      });

      // House marker
      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 2px #ef4444;";
      new maplibregl.Marker({ element: el })
        .setLngLat([house.lon, house.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(house.label))
        .addTo(map);

      const bounds = new maplibregl.LngLatBounds();
      for (const f of colored.features) extendBounds(bounds, f.geometry);
      bounds.extend([house.lon, house.lat]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 36, duration: 0 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Initialise the map exactly once, on mount. `geojson`/`house` are stable
    // for the lifetime of the page, so we deliberately do not re-run this
    // effect on re-render — that would re-create the map and reset pan/zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the highlighted constituency outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("cons-selected")) {
        map.setFilter("cons-selected", ["==", ["get", "ac_no"], selectedAc ?? -1]);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [selectedAc]);

  return <div ref={containerRef} className="h-full w-full" />;
}
