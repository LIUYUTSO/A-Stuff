import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { locationInfo as archiveManifest } from '../data/collections';
import { SpeedInsights } from '@vercel/speed-insights/next';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="va-map-idle" aria-hidden="true" />,
});

const ModelPopup = dynamic(() => import('../components/ModelPopup'), { ssr: false });

const ModelPreview = dynamic(() => import('../components/ModelPreview'), {
  ssr: false,
  loading: () => <div className="va-stage-idle" aria-hidden="true" />,
});

const INSTAGRAM = 'https://www.instagram.com/adam.liou/';

const pad2 = (value) => String(value).padStart(2, '0');

const formatCoordinates = (coordinates) =>
  Array.isArray(coordinates) && coordinates.length === 2
    ? `${Number(coordinates[0]).toFixed(3)}, ${Number(coordinates[1]).toFixed(3)}`
    : '—';

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!Array.isArray(archiveManifest)) {
      setStatus('error');
      return;
    }

    setRecords(archiveManifest);
    setStatus(archiveManifest.length ? 'ready' : 'empty');
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;

    const targets = Array.from(document.querySelectorAll('.va-reveal'));

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('va-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('va-in');
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [status]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setSelectedLocation(null);
    }, 200);
  }, []);

  const handleSelectLocation = useCallback((location) => {
    setSelectedLocation(location);
  }, []);

  const yearRange = useMemo(() => {
    const years = records
      .map((record) => Number.parseInt(String(record.date || '').slice(0, 4), 10))
      .filter(Number.isFinite);

    if (!years.length) return '';
    const first = Math.min(...years);
    const last = Math.max(...years);
    return first === last ? `${first}` : `${first}—${last}`;
  }, [records]);

  const count = pad2(records.length);

  const head = (
    <Head>
      <link rel="icon" href="/favicon.ico" type="image/x-icon" />
      <title>A-Stuff</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta
        name="description"
        content="A-Stuff is an archive of scanned objects, each one pinned to the coordinate where it was picked up."
      />
    </Head>
  );

  if (status !== 'ready') {
    const message =
      status === 'error'
        ? '[ERROR] — THE ARCHIVE MANIFEST DID NOT PARSE.'
        : status === 'empty'
          ? '[EMPTY] — NOTHING SCANNED YET.'
          : '[LOADING] — READING ARCHIVE';

    return (
      <>
        {head}
        <main
          className="va-state"
          aria-busy={status === 'loading'}
          role={status === 'error' ? 'alert' : undefined}
        >
          <p>{message}</p>
        </main>
        <style jsx global>{`
          ${MODE_E_BASE}

          .va-state {
            min-height: 100vh;
            min-height: 100dvh;
            display: grid;
            place-content: center;
            padding: var(--e-pad);
          }

          .va-state p {
            margin: 0;
            font-size: 12px;
            letter-spacing: var(--e-track);
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      {head}

      <a className="va-skip" href="#plaza">
        SKIP TO OBJECTS
      </a>

      <main className="va-page">
        {/* The basemap is the ground floor: full-bleed, pinned, and the sheet
            below rides up over it as you scroll. No frame, no max-width. The
            masthead travels with the map rather than floating over the sheet. */}
        <section className="va-hero" aria-label="Archive map">
          <div className="va-hero-map">
            <Map locations={records} onSelectLocation={handleSelectLocation} />
          </div>

          <div className="va-hero-chrome">
            <header className="va-nav">
              <Link href="/" className="va-nav-brand">
                A-Stuff™
              </Link>

              <span className="va-nav-mid">[Archive — {count}]</span>

              <a className="va-nav-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
                ↘ Instagram
              </a>
            </header>

            <div className="va-hero-block">
              <p className="va-label">[Map] — {count} coordinates</p>
              <h1 className="va-hero-title">
                Every object here was picked up somewhere, scanned, and put back down.
              </h1>
              <p className="va-hero-hint">
                ↯ <span className="va-fine-only">Drag the map — </span>each marker opens one record.
              </p>
            </div>
          </div>
        </section>

        <div className="va-sheet">
          <section className="va-plaza" id="plaza">
            <div className="va-head va-reveal">
              <p className="va-label">[Plaza] — model wall</p>
              <p className="va-head-note">Scanned at 1:1 — drag to turn.</p>
            </div>

            <div className="va-grid">
              {records.map((item, index) => (
                <button
                  type="button"
                  key={item.id ?? `${item.name}-${index}`}
                  className={`va-card va-s${index % 5} va-reveal`}
                  onClick={() => handleSelectLocation(item)}
                  aria-label={`Open record ${pad2(index + 1)} — ${item.name}`}
                >
                  <span className="va-card-stage">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="va-card-image" loading="lazy" />
                    ) : item.modelPath ? (
                      <ModelPreview
                        modelPath={item.modelPath}
                        scale={item.scale || 1}
                        intensity={item.intensity || 1.5}
                        rotationY={item.rotationY || 0}
                        autoRotateSpeed={item.autoRotateSpeed || 0}
                        fov={52}
                        adjustCamera={1.8}
                        position={item.originOffset || [0, 0, 0]}
                      />
                    ) : (
                      <span className="va-card-void">[No model]</span>
                    )}
                  </span>

                  <span className="va-card-caption">
                    <em>
                      {pad2(index + 1)} — {item.name} — {item.location || 'Unplaced'}
                    </em>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="va-index" aria-labelledby="index-label">
            <div className="va-head va-reveal">
              <p className="va-label" id="index-label">
                [Index] — every record, flat
              </p>
              <p className="va-head-note">{count} entries — {yearRange}</p>
            </div>

            <ul className="va-list">
              {records.map((item, index) => (
                <li key={item.id ?? `row-${index}`} className="va-reveal">
                  <button type="button" className="va-row" onClick={() => handleSelectLocation(item)}>
                    <span className="va-row-no">{pad2(index + 1)}</span>
                    <span className="va-row-name">{item.name}</span>
                    <span className="va-row-place">{item.location || 'Unplaced'}</span>
                    <span className="va-row-date">{item.date || '—'}</span>
                    <span className="va-row-coord">{formatCoordinates(item.coordinates)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <footer className="va-footer">
            <a className="va-nav-link" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
              ↘ Instagram
            </a>

            <div className="va-footer-mark">
              <span>A-Stuff™</span>
              <span>Calgary</span>
              <span>{yearRange}</span>
            </div>
          </footer>
        </div>

        {selectedLocation && (
          <ModelPopup selectedLocation={selectedLocation} isClosing={isClosing} onClose={handleClose} />
        )}

        <SpeedInsights />
      </main>

      <style jsx global>{`
        ${MODE_E_BASE}

        .va-skip {
          position: fixed;
          top: -100px;
          left: var(--e-pad);
          z-index: 3000;
          padding: 8px 0;
          font-size: 11px;
          letter-spacing: var(--e-track);
          background: var(--e-ground);
        }

        .va-skip:focus {
          top: 0;
        }

        /* ── NAV ─────────────────────────────────────────────
           Transparent, no border, no blur. Sits on whatever
           passes underneath it. */
        .va-nav {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          font-size: 11px;
          letter-spacing: var(--e-track);
        }

        .va-nav > * {
          pointer-events: auto;
        }

        .va-nav-mid {
          display: none;
        }

        .va-page {
          position: relative;
        }

        /* ── HERO ────────────────────────────────────────────
           100dvh of basemap, pinned; the sheet scrolls over it. */
        .va-hero {
          position: sticky;
          top: 0;
          z-index: 0;
          height: 100vh;
          height: 100dvh;
        }

        .va-hero-map {
          position: absolute;
          inset: 0;
          isolation: isolate;
        }

        .va-hero-chrome {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: var(--e-pad);
          /* Clears the attribution strip Leaflet parks in the bottom rail. */
          padding-bottom: calc(var(--e-pad) + 26px);
          pointer-events: none;
        }

        .va-hero-block {
          max-width: 46ch;
          pointer-events: auto;
        }

        .va-hero-title {
          margin: 14px 0 0;
          font-size: clamp(14px, 1.2vw, 18px);
          font-weight: 300;
          line-height: 1.2;
          letter-spacing: var(--e-track);
          text-transform: uppercase;
        }

        .va-hero-hint {
          margin: 20px 0 0;
          font-size: 11px;
          letter-spacing: var(--e-track);
        }

        .va-fine-only {
          display: none;
        }

        .va-map-idle,
        .va-stage-idle {
          width: 100%;
          height: 100%;
          background: var(--e-ground);
        }

        /* ── SHEET ───────────────────────────────────────────
           Opaque ground that rides over the pinned map. */
        .va-sheet {
          position: relative;
          z-index: 1;
          background: var(--e-ground);
        }

        .va-label {
          margin: 0;
          font-size: 11px;
          letter-spacing: var(--e-track);
        }

        .va-head {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 8px 24px;
          padding: var(--e-pad) var(--e-pad) calc(var(--e-pad) * 0.6);
        }

        .va-head-note {
          margin: 0;
          font-size: 11px;
          letter-spacing: var(--e-track);
        }

        /* ── PLAZA GRID ──────────────────────────────────────
           Irregular spans on a 2 / 6 / 12 column track. Images
           run to the viewport edge; the 4px gutter is the only
           thing between them. */
        .va-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--e-gap);
          padding: 0 var(--e-gap);
        }

        .va-card {
          appearance: none;
          display: block;
          width: 100%;
          margin: 0;
          padding: 0;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }

        .va-card:focus-visible {
          outline: 2px solid var(--e-ink);
        }

        .va-card-stage {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
        }

        .va-card-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .va-card-void {
          position: absolute;
          inset: 0;
          display: grid;
          place-content: center;
          font-size: 11px;
          letter-spacing: var(--e-track);
        }

        .va-card-caption {
          display: block;
          padding: 10px 0 calc(var(--e-pad) * 0.5);
          font-size: 11px;
          letter-spacing: var(--e-track);
          line-height: 1.6;
        }

        .va-card:hover .va-card-caption em {
          text-decoration: underline;
        }

        .va-s0 .va-card-stage {
          aspect-ratio: 4 / 3;
        }

        .va-s0 {
          grid-column: span 2;
        }

        /* ── INDEX ───────────────────────────────────────────*/
        .va-index {
          padding-top: calc(var(--e-pad) * 0.8);
        }

        .va-list {
          margin: 0;
          padding: 0 var(--e-pad) var(--e-pad);
          list-style: none;
        }

        .va-row {
          appearance: none;
          display: grid;
          grid-template-columns: 3ch minmax(0, 1fr);
          gap: 4px 16px;
          width: 100%;
          margin: 0;
          padding: 12px 0;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          font-size: 11px;
          letter-spacing: var(--e-track);
          line-height: 1.6;
          text-align: left;
          cursor: pointer;
        }

        .va-row:hover .va-row-name {
          text-decoration: underline;
        }

        .va-row:focus-visible {
          outline: 2px solid var(--e-ink);
        }

        .va-row-place,
        .va-row-date,
        .va-row-coord {
          grid-column: 2;
        }

        /* Tracking is not counted by the ch unit, so an ISO date has to claim
           its own width rather than be measured in characters. */
        .va-row-date,
        .va-row-coord {
          white-space: nowrap;
        }

        /* ── FOOTER ──────────────────────────────────────────*/
        .va-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          padding: calc(var(--e-pad) * 2) var(--e-pad) var(--e-pad);
          font-size: 11px;
          letter-spacing: var(--e-track);
          line-height: 2;
        }

        .va-footer-mark {
          display: flex;
          flex-direction: column;
          text-align: right;
        }

        /* ── REVEAL ──────────────────────────────────────────
           Opacity only. No transform, ever. */
        .va-reveal {
          opacity: 0;
          transition: opacity 200ms linear;
        }

        .va-reveal.va-in {
          opacity: 1;
        }

        @media (hover: hover) and (pointer: fine) {
          .va-fine-only {
            display: inline;
          }
        }

        @media (min-width: 768px) {
          .va-nav-mid {
            display: inline;
          }

          .va-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }

          .va-s0,
          .va-s1 {
            grid-column: span 3;
          }

          .va-s0 .va-card-stage,
          .va-s1 .va-card-stage {
            aspect-ratio: 1 / 1;
          }

          .va-s2,
          .va-s3,
          .va-s4 {
            grid-column: span 2;
          }

          .va-row {
            /* Every row is its own grid, so the tracks have to be stated in
               absolute terms or the columns drift row to row. ch ignores
               letter-spacing, hence the em term: 10 glyphs x 0.12em. */
            grid-template-columns:
              4ch
              minmax(0, 3fr)
              minmax(0, 2fr)
              calc(10ch + 1.4em)
              calc(19ch + 2.5em);
            align-items: baseline;
          }

          .va-row-place,
          .va-row-date,
          .va-row-coord {
            grid-column: auto;
          }
        }

        @media (min-width: 1200px) {
          .va-grid {
            grid-template-columns: repeat(12, minmax(0, 1fr));
          }

          .va-s0 {
            grid-column: span 7;
          }

          .va-s0 .va-card-stage {
            aspect-ratio: 7 / 5;
          }

          .va-s1 {
            grid-column: span 5;
          }

          .va-s2,
          .va-s3,
          .va-s4 {
            grid-column: span 4;
          }
        }
      `}</style>
    </>
  );
}

/* Mode E ground rules, shared by the loading / empty / error states and the
   archive itself so no route can drift off the palette. */
const MODE_E_BASE = `
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
    background: var(--e-ground);
    color-scheme: light dark;
  }

  body {
    margin: 0;
    padding: 0;
    background: var(--e-ground);
    color: var(--e-ink);
    font-family: var(--font-e);
    font-weight: 300;
    font-size: 12px;
    line-height: 1.6;
    letter-spacing: var(--e-track);
    text-transform: uppercase;
    overflow-x: clip;
    -webkit-font-smoothing: antialiased;
  }

  ::selection {
    background: var(--e-ink);
    color: var(--e-ground);
  }

  button {
    text-transform: inherit;
    letter-spacing: inherit;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  :focus-visible {
    outline: 2px solid var(--e-ink);
    outline-offset: 0;
  }

  h1, h2, h3, p, em {
    font-weight: 300;
  }

  em {
    font-style: italic;
  }

  img {
    max-width: 100%;
  }
`;
