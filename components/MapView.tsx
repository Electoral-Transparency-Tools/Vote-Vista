"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import { partyColor } from "@/lib/format";

interface MapViewProps {
  geojson: GeoJSON.FeatureCollection;
  house: { lat: number; lon: number; label: string };
  winnerPartyShort: string;
  highlight: boolean;
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

export default function MapView({
  geojson,
  house,
  winnerPartyShort,
  highlight,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [house.lon, house.lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("constituency", { type: "geojson", data: geojson });
      const color = partyColor(winnerPartyShort);

      map.addLayer({
        id: "constituency-fill",
        type: "fill",
        source: "constituency",
        paint: { "fill-color": color, "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "constituency-line",
        type: "line",
        source: "constituency",
        paint: { "line-color": color, "line-width": 2.5 },
      });

      // House marker
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 2px #ef4444;";
      new maplibregl.Marker({ element: el })
        .setLngLat([house.lon, house.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(house.label))
        .addTo(map);

      // Fit to polygon bounds
      const bounds = new maplibregl.LngLatBounds();
      const fc = geojson;
      for (const f of fc.features) {
        const g = f.geometry;
        const polys =
          g.type === "Polygon"
            ? [g.coordinates]
            : g.type === "MultiPolygon"
              ? g.coordinates
              : [];
        for (const poly of polys) {
          for (const ring of poly as number[][][]) {
            for (const c of ring) bounds.extend([c[0], c[1]]);
          }
        }
      }
      bounds.extend([house.lon, house.lat]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, duration: 0 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geojson, house, winnerPartyShort]);

  // Toggle highlight opacity when the winner filter is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer("constituency-fill")) {
      map.setPaintProperty(
        "constituency-fill",
        "fill-opacity",
        highlight ? 0.32 : 0.18,
      );
    }
  }, [highlight]);

  return <div ref={containerRef} className="h-full w-full" />;
}
