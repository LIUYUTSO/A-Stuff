import { AttributionControl, MapContainer, TileLayer, Marker, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useMemo } from 'react';

export default function Map({ locations, onSelectLocation }) {
  // Mode E marker: a naked 9px square. No teardrop silhouette, no shadow.
  // Colour comes from CSS so it inverts with the rest of the page.
  const squarePin = useMemo(
    () =>
      L.divIcon({
        className: 'va-pin',
        html: '',
        iconSize: [9, 9],
        iconAnchor: [4, 4],
      }),
    []
  );

  // On touch the map runs the full height of the viewport, so panning would
  // swallow every scroll gesture and strand the reader on the hero. Markers
  // stay tappable; the grid and index below carry the same records.
  const isTouch = useMemo(() => Boolean(L.Browser && L.Browser.mobile), []);

  const pinned = useMemo(
    () =>
      (locations || []).filter(
        (location) => Array.isArray(location.coordinates) && location.coordinates.length === 2
      ),
    [locations]
  );

  return (
    <>
      <MapContainer
        center={[24, 6]}
        zoom={2}
        minZoom={2}
        worldCopyJump
        className="h-full w-full outline-none"
        zoomControl={false}
        attributionControl={false}
        dragging={!isTouch}
        scrollWheelZoom={false}
        doubleClickZoom={!isTouch}
        touchZoom={!isTouch}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        {/* Default prefix ships a coloured flag glyph — Mode E keeps the
            required OSM / CARTO credit and drops the emoji. */}
        <AttributionControl position="bottomright" prefix={false} />
        <ZoomControl position="bottomright" />
        {pinned.map((location, index) => (
          <Marker
            key={location.id ?? `${location.name}-${index}`}
            position={location.coordinates}
            icon={squarePin}
            alt={location.name}
            keyboard
            eventHandlers={{
              click: () => onSelectLocation(location),
              keypress: (event) => {
                if (event.originalEvent.key === 'Enter') onSelectLocation(location);
              },
            }}
          />
        ))}
      </MapContainer>

      <style jsx global>{`
        .leaflet-container {
          background: var(--e-ground);
          font-family: var(--font-e);
          outline: 0;
        }

        /* Push the basemap down to paper so ink type reads anywhere on it. */
        .leaflet-tile-pane {
          filter: grayscale(1) brightness(1.06) contrast(0.92);
        }

        .va-pin {
          background: var(--e-ink);
          cursor: pointer;
        }

        .va-pin:focus-visible {
          outline: 2px solid var(--e-ink);
          outline-offset: 3px;
        }

        .leaflet-control-zoom,
        .leaflet-bar {
          border: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }

        .leaflet-control-zoom a.leaflet-control-zoom-in,
        .leaflet-control-zoom a.leaflet-control-zoom-out {
          width: 34px;
          height: 34px;
          line-height: 34px;
          border: 0;
          border-radius: 0 !important;
          background: var(--e-ground);
          color: var(--e-ink);
          font-family: var(--font-e);
          font-weight: 300;
          font-size: 13px;
        }

        .leaflet-control-zoom a.leaflet-control-zoom-in {
          margin-bottom: var(--e-gap);
        }

        .leaflet-control-zoom a:hover {
          background: var(--e-ground);
          color: var(--e-ink);
          text-decoration: underline;
        }

        .leaflet-control-attribution {
          background: var(--e-ground) !important;
          color: var(--e-ink);
          font-family: var(--font-e);
          font-size: 9px;
          font-weight: 300;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 5px 9px;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        .leaflet-control-attribution a {
          color: var(--e-ink);
          text-decoration: none;
        }

        .leaflet-control-attribution a:hover {
          text-decoration: underline;
        }

        @media (prefers-color-scheme: dark) {
          .leaflet-tile-pane {
            filter: grayscale(1) invert(1) brightness(0.94) contrast(1.04);
          }
        }
      `}</style>
    </>
  );
}
