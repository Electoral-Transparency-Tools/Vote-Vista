"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import { partyColor } from "@/lib/format";

interface MapViewProps {
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

export default function MapView({ house, selectedAc, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Client-side cache of constituency features already loaded (by ac_no), so
  // panning back over a region does not refetch/redraw it.
  const cacheRef = useRef<Map<number, GeoJSON.Feature>>(new Map());

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

    const buildData = (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: [...cacheRef.current.values()].map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          color: partyColor(String(f.properties?.winner_party_short ?? "")),
        },
      })),
    });

    async function loadViewport() {
      const b = map.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
      try {
        const res = await fetch(`/api/constituencies?bbox=${bbox}`);
        if (!res.ok) return;
        const fc: GeoJSON.FeatureCollection = await res.json();
        let added = 0;
        for (const f of fc.features) {
          const ac = Number(f.properties?.ac_no);
          if (!cacheRef.current.has(ac)) {
            cacheRef.current.set(ac, f);
            added++;
          }
        }
        if (added > 0) {
          const src = map.getSource("cons") as maplibregl.GeoJSONSource | undefined;
          src?.setData(buildData());
        }
      } catch {
        /* ignore network errors */
      }
    }

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onMoveEnd = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(loadViewport, 350);
    };

    map.on("load", () => {
      map.addSource("cons", { type: "geojson", data: buildData() });
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
            .setHTML(`<strong>${f.properties?.ac_name ?? ""}</strong>`)
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

      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 2px #ef4444;";
      new maplibregl.Marker({ element: el })
        .setLngLat([house.lon, house.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(house.label))
        .addTo(map);

      loadViewport();
      map.on("moveend", onMoveEnd);
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      map.remove();
      mapRef.current = null;
    };
    // Initialise the map exactly once, on mount. Data is loaded dynamically by
    // viewport; re-running this effect would reset pan/zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the highlighted constituency outline when selection changes.
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
