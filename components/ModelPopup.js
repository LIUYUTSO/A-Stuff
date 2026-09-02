import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const ModelPreview = dynamic(() => import('./ModelPreview'), { ssr: false });

const formatCoordinates = (coordinates) =>
  Array.isArray(coordinates) && coordinates.length === 2
    ? `${Number(coordinates[0]).toFixed(6)}, ${Number(coordinates[1]).toFixed(6)}`
    : '—';

export default function ModelPopup({ selectedLocation, isClosing, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);

    // The record takes the whole viewport; leaving the page scrollable behind
    // it lets the archive drift under a fixed layer that never moves.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!selectedLocation) return null;

  return (
    <div
      className={`va-record ${isClosing ? 'is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Record — ${selectedLocation.name}`}
    >
      <button type="button" ref={closeRef} className="va-record-close" onClick={onClose}>
        [Close]
      </button>

      <div className="va-record-stage">
        <ModelPreview
          modelPath={selectedLocation.highModelPath || selectedLocation.modelPath}
          scale={selectedLocation.scale || 1}
          intensity={selectedLocation.intensity || 1.5}
          rotationY={selectedLocation.rotationY || 0}
          autoRotateSpeed={selectedLocation.autoRotateSpeed || 0}
          cameraDistance={selectedLocation.cameraDistance || 1.8}
          position={selectedLocation.originOffset || [0, 0, 0]}
        />
      </div>

      <div className="va-record-text">
        <p className="va-record-meta">
          {selectedLocation.location || 'Unplaced'} — {selectedLocation.date || 'Undated'}
        </p>

        <h2 className="va-record-title">{selectedLocation.name}</h2>

        <p className="va-record-note">{selectedLocation.travelNote || 'No note recorded.'}</p>

        <dl className="va-record-spec">
          <dt>Coordinates</dt>
          <dd>{formatCoordinates(selectedLocation.coordinates)}</dd>
          <dt>Mesh</dt>
          <dd>{selectedLocation.highModelPath ? 'High + low poly' : 'Single poly'}</dd>
        </dl>
      </div>

      <style jsx global>{`
        /* Mode E record view: no panel, no backdrop blur, no shadow. The page
           is simply replaced by the object until [CLOSE]. */
        .va-record {
          position: fixed;
          inset: 0;
          z-index: 5000;
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          background: var(--e-ground);
          color: var(--e-ink);
          opacity: 1;
          transition: opacity 200ms linear;
        }

        .va-record.is-closing {
          opacity: 0;
          pointer-events: none;
        }

        .va-record-close {
          position: absolute;
          top: var(--e-pad);
          right: var(--e-pad);
          z-index: 2;
          appearance: none;
          margin: 0;
          padding: 0;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          font-size: 11px;
          letter-spacing: var(--e-track);
          text-transform: uppercase;
          cursor: pointer;
        }

        .va-record-close:hover {
          text-decoration: underline;
        }

        .va-record-close:focus-visible {
          outline: 2px solid var(--e-ink);
        }

        .va-record-stage {
          position: relative;
          min-height: 0;
          min-width: 0;
        }

        .va-record-text {
          padding: 0 var(--e-pad) var(--e-pad);
          overflow-y: auto;
          max-height: 46dvh;
        }

        .va-record-meta,
        .va-record-note,
        .va-record-spec {
          font-size: 11px;
          letter-spacing: var(--e-track);
          line-height: 1.6;
        }

        .va-record-meta {
          margin: 0;
        }

        .va-record-title {
          margin: 12px 0 0;
          font-size: clamp(14px, 1.2vw, 18px);
          font-weight: 300;
          line-height: 1.2;
          letter-spacing: var(--e-track);
        }

        .va-record-note {
          margin: 20px 0 0;
          max-width: 52ch;
          white-space: pre-line;
        }

        .va-record-spec {
          display: grid;
          grid-template-columns: minmax(0, auto) minmax(0, 1fr);
          gap: 4px 16px;
          margin: 28px 0 0;
        }

        .va-record-spec dd {
          margin: 0;
        }

        @media (min-width: 900px) {
          .va-record {
            grid-template-rows: none;
            grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.6fr);
          }

          .va-record-text {
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            max-height: none;
            padding: calc(var(--e-pad) * 2) var(--e-pad) var(--e-pad) 0;
          }
        }
      `}</style>
    </div>
  );
}
