"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, LoaderCircle, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const LeafletMap = dynamic(() => import("./location-picker/leaflet-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // Geographic center of India
const DEFAULT_ZOOM = 5;
const PICKED_ZOOM = 15;

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface ContextLocation {
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface LocationPickerPanelProps {
  initialLat: number | null;
  initialLng: number | null;
  initialRadiusMeters?: number;
  showRadius?: boolean;
  /** A related location (e.g. the parent place) to frame in view and show as a reference circle. */
  contextLocation?: ContextLocation | null;
  onCancel: () => void;
  onConfirm: (lat: number, lng: number, radiusMeters: number) => void;
}

export function LocationPickerPanel({
  initialLat,
  initialLng,
  initialRadiusMeters,
  showRadius = true,
  contextLocation,
  onCancel,
  onConfirm,
}: LocationPickerPanelProps) {
  const hasInitial = initialLat != null && initialLng != null;
  const fitToContext = !hasInitial && !!contextLocation;

  const [position, setPosition] = React.useState({
    lat: hasInitial ? initialLat! : contextLocation ? contextLocation.lat : DEFAULT_CENTER.lat,
    lng: hasInitial ? initialLng! : contextLocation ? contextLocation.lng : DEFAULT_CENTER.lng,
  });
  const [radius, setRadius] = React.useState(initialRadiusMeters || 100);
  const [search, setSearch] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<NominatimResult[]>([]);
  const [flyTo, setFlyTo] = React.useState<{ lat: number; lng: number; zoom: number; token: number } | null>(
    null,
  );
  const flyTokenRef = React.useRef(0);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(search)}`,
      );
      if (!res.ok) throw new Error("Search failed");
      const data: NominatimResult[] = await res.json();
      setResults(data);
      if (data.length === 0) toast.error("No matching places found");
    } catch {
      toast.error("Location search failed");
    } finally {
      setSearching(false);
    }
  }

  function selectResult(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setPosition({ lat, lng });
    setSearch(result.display_name);
    setResults([]);
    flyTokenRef.current += 1;
    setFlyTo({ lat, lng, zoom: PICKED_ZOOM, token: flyTokenRef.current });
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={runSearch} className="relative flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for an address or place..."
        />
        <Button type="submit" variant="outline" disabled={searching}>
          {searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
        {results.length > 0 && (
          <div className="bg-popover absolute top-full left-0 z-10 mt-1 w-full rounded-md border shadow-md">
            {results.map((result, i) => (
              <button
                type="button"
                key={i}
                onClick={() => selectResult(result)}
                className="hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left text-sm"
              >
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>{result.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {contextLocation && (
        <p className="text-muted-foreground text-xs">
          The dashed circle shows the selected place&apos;s location and radius.
        </p>
      )}

      <div className="h-96 w-full overflow-hidden rounded-md border">
        <LeafletMap
          lat={position.lat}
          lng={position.lng}
          radiusMeters={showRadius ? radius : undefined}
          zoom={hasInitial || contextLocation ? PICKED_ZOOM : DEFAULT_ZOOM}
          flyTo={flyTo}
          contextCircle={contextLocation}
          fitToContext={fitToContext}
          onPick={(lat, lng) => setPosition({ lat, lng })}
        />
      </div>

      <div className={`grid grid-cols-1 gap-4 ${showRadius ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div className="grid gap-2">
          <Label>Latitude</Label>
          <Input value={position.lat.toFixed(6)} readOnly disabled />
        </div>
        <div className="grid gap-2">
          <Label>Longitude</Label>
          <Input value={position.lng.toFixed(6)} readOnly disabled />
        </div>
        {showRadius && (
          <div className="grid gap-2">
            <Label htmlFor="picker-radius">Radius (m)</Label>
            <Input
              id="picker-radius"
              type="number"
              min={1}
              step="1"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value) || 0)}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button type="button" onClick={() => onConfirm(position.lat, position.lng, radius)}>
          Use This Location
        </Button>
      </div>
    </div>
  );
}
