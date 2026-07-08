"use client";

import * as React from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon references image paths that don't survive
// Next.js bundling, so point it at the matching version's CDN assets instead.
const DEFAULT_ICON = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const OSM_TILE_URL =
  process.env.NEXT_PUBLIC_OSM_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

interface ContextCircle {
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface LeafletMapProps {
  lat: number;
  lng: number;
  radiusMeters?: number;
  zoom: number;
  flyTo: { lat: number; lng: number; zoom: number; token: number } | null;
  contextCircle?: ContextCircle | null;
  fitToContext?: boolean;
  onPick: (lat: number, lng: number) => void;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToHandler({ flyTo }: { flyTo: LeafletMapProps["flyTo"] }) {
  const map = useMap();
  const lastToken = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!flyTo || flyTo.token === lastToken.current) return;
    lastToken.current = flyTo.token;
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 0.75 });
  }, [flyTo, map]);
  return null;
}

// Frames the whole context circle (e.g. the parent place's geofence) in view
// once, on initial mount only - lets the user see where they're picking within.
function FitToContextHandler({ contextCircle }: { contextCircle: ContextCircle | null | undefined }) {
  const map = useMap();
  React.useEffect(() => {
    if (!contextCircle) return;
    // toBounds() computes bounds from geo math alone (size = full box width/height
    // in meters); a bare L.circle(...).getBounds() would throw here since that
    // requires the circle to already be attached to a map for pixel projection.
    const bounds = L.latLng(contextCircle.lat, contextCircle.lng).toBounds(contextCircle.radiusMeters * 2);
    map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function LeafletMap({
  lat,
  lng,
  radiusMeters,
  zoom,
  flyTo,
  contextCircle,
  fitToContext,
  onPick,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={OSM_TILE_URL}
      />
      <Marker
        position={[lat, lng]}
        icon={DEFAULT_ICON}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const marker = e.target as L.Marker;
            const pos = marker.getLatLng();
            onPick(pos.lat, pos.lng);
          },
        }}
      />
      {radiusMeters != null && (
        <Circle center={[lat, lng]} radius={radiusMeters} pathOptions={{ color: "#2563eb", fillOpacity: 0.1 }} />
      )}
      {contextCircle && (
        <Circle
          center={[contextCircle.lat, contextCircle.lng]}
          radius={contextCircle.radiusMeters}
          pathOptions={{ color: "#9333ea", dashArray: "6 4", fillOpacity: 0.03 }}
        />
      )}
      <ClickHandler onPick={onPick} />
      <FlyToHandler flyTo={flyTo} />
      {fitToContext && <FitToContextHandler contextCircle={contextCircle} />}
    </MapContainer>
  );
}
