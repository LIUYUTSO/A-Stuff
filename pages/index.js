import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FaInstagram } from 'react-icons/fa';
import { locationInfo as defaultLocationInfo } from '../data/collections';
import Head from 'next/head';
import Link from 'next/link';
import { SpeedInsights } from '@vercel/speed-insights/next';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div className="va-map-loading" aria-hidden="true" />,
});

const ModelPopup = dynamic(() => import('../components/ModelPopup'), { ssr: false });

const ModelPreview = dynamic(() => import('../components/ModelPreview'), {
  ssr: false,
  loading: () => <div className="va-preview-loading" aria-hidden="true" />,
});

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [locationInfo, setLocationInfo] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setLocationInfo(defaultLocationInfo);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('va-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );

    document.querySelectorAll('.va-reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isLoading]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setSelectedLocation(null);
    }, 260);
  }, []);

  const handleSelectLocation = useCallback((location) => {
    setSelectedLocation(location);
  }, []);

  if (isLoading) {
    return (
      <div className="va-loading" aria-busy="true" aria-label="Loading archive">
        <div className="va-loading-kicker">Loading archive</div>
        <div className="va-loading-line" />
        <div className="va-loading-line short" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <title>A-Stuff</title>
        <meta
          name="description"
          content="A quiet archive of travel objects, presented as a minimal editorial map and object plaza."
        />
      </Head>

      <main className="va-page">
        <header className="va-topbar">
          <div>
            <Link href="/" className="va-brand">
              A-Stuff
            </Link>
            <div className="va-brand-sub">Archive / {String(locationInfo.length).padStart(2, '0')} records</div>
          </div>

          <div className="va-topbar-right">
            <div className="va-topbar-note">Interactive map / object plaza</div>
            <Link href="/admin" className="va-admin-link">
              Admin
            </Link>
          </div>
        </header>

        <section className="va-hero">
          <div className="va-hero-copy">
            <div className="va-kicker va-reveal">Map first / minimal archive</div>
            <h1 className="va-hero-title va-reveal">
              Objects pinned to places, kept clean and quiet.
            </h1>
            <p className="va-hero-body va-reveal">
              A stripped-back map-led entry point. Use the map to orient yourself, then open any object for the
              smallest useful record.
            </p>
            </div>

          <div className="va-hero-map va-reveal">
            <Map locations={locationInfo} onSelectLocation={handleSelectLocation} />
            <div className="va-map-overlay">
              <div className="va-map-tag">Interactive map</div>
              <div className="va-map-title">Select a place</div>
              <div className="va-map-sub">Map markers open the related record.</div>
            </div>
          </div>
        </section>

        <section className="va-plaza">
          <div className="va-section-head va-reveal">
            <div>
              <div className="va-section-label">Object plaza</div>
              <h2 className="va-section-title">Model wall</h2>
            </div>
            <div className="va-section-count">
              <span>{String(locationInfo.length).padStart(2, '0')}</span>
              <small>records</small>
            </div>
          </div>

          <div className="va-grid">
            {locationInfo.map((item, index) => (
              <article
                key={item.id || item.name || index}
                className="va-card va-reveal"
                onClick={() => handleSelectLocation(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectLocation(item);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open record for ${item.name}`}
              >
                <div className="va-card-frame">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.name} className="va-card-thumb" />
                  ) : item.modelPath ? (
                    <ModelPreview
                      modelPath={item.modelPath}
                      scale={1}
                      intensity={item.intensity || 1.5}
                      rotationY={item.rotationY || 0}
                      autoRotateSpeed={item.autoRotateSpeed || 2}
                      fov={52}
                      adjustCamera={1.8}
                    />
                  ) : (
                    <div className="va-card-placeholder">
                      <div className="va-card-glyph" />
                    </div>
                  )}
                  <div className="va-card-index">
                    {String(index + 1).padStart(2, '0')} / {String(locationInfo.length).padStart(2, '0')}
                  </div>
                </div>

                <div className="va-card-meta">
                  <h3>{item.name}</h3>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="va-footer">
          <div className="va-footer-top">
            <div>
              <div className="va-footer-label">Archive</div>
              <div className="va-footer-title">A-Stuff</div>
            </div>

            <div className="va-footer-meta">
              <a
                href="https://www.instagram.com/adam.liou/"
                target="_blank"
                rel="noopener noreferrer"
                className="va-ig"
                aria-label="Instagram"
              >
                <FaInstagram size={18} />
              </a>
              <span>Adam Liu</span>
            </div>
          </div>
        </footer>

        {selectedLocation && (
          <ModelPopup
            selectedLocation={selectedLocation}
            isClosing={isClosing}
            onClose={handleClose}
          />
        )}

        <SpeedInsights />
      </main>

      <style jsx global>{`
        *, *::before, *::after {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
          background: #f7f6f2;
        }

        body {
          margin: 0;
          padding: 0;
          background: #f7f6f2;
          color: #111111;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
          overflow-x: hidden;
        }

        ::selection {
          background: rgba(17, 17, 17, 0.12);
          color: #111111;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .va-page {
          position: relative;
          min-height: 100vh;
          background: linear-gradient(180deg, #f7f6f2 0%, #f4f3ee 100%);
        }

        .va-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image: radial-gradient(rgba(17, 17, 17, 0.022) 1px, transparent 1px);
          background-size: 18px 18px;
          opacity: 0.42;
          mix-blend-mode: multiply;
        }

        .va-topbar,
        .va-hero,
        .va-plaza,
        .va-footer {
          position: relative;
          z-index: 1;
          max-width: 1440px;
          margin: 0 auto;
          padding-left: 32px;
          padding-right: 32px;
        }

        .va-topbar {
          padding-top: 24px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .va-brand {
          display: inline-block;
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
          font-size: 18px;
          line-height: 1;
          letter-spacing: -0.02em;
        }

        .va-brand-sub,
        .va-topbar-note,
        .va-admin-link,
        .va-kicker,
        .va-hero-body,
        .va-section-label,
        .va-section-count,
        .va-card-index,
        .va-footer-label,
        .va-footer-meta {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 10px;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        .va-brand-sub {
          margin-top: 8px;
          color: rgba(17, 17, 17, 0.48);
        }

        .va-topbar-right {
          display: flex;
          align-items: center;
          gap: 20px;
          padding-top: 2px;
        }

        .va-topbar-note {
          color: rgba(17, 17, 17, 0.44);
          white-space: nowrap;
        }

        .va-admin-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 14px;
          border-bottom: 1px solid rgba(17, 17, 17, 0.22);
          color: rgba(17, 17, 17, 0.78);
          transition: color 180ms ease, border-color 180ms ease;
        }

        .va-admin-link:hover {
          color: #111111;
          border-color: rgba(17, 17, 17, 0.5);
        }

        .va-hero {
          padding-top: 96px;
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
          gap: 34px;
          align-items: stretch;
        }

        .va-hero-copy {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 8px 0 10px;
          min-height: 64vh;
        }

        .va-kicker {
          color: rgba(17, 17, 17, 0.52);
          margin-bottom: 16px;
        }

        .va-hero-title {
          margin: 0;
          max-width: 11ch;
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
          font-size: clamp(54px, 6.8vw, 108px);
          line-height: 0.94;
          letter-spacing: -0.05em;
          font-weight: 400;
          text-wrap: balance;
        }

        .va-hero-body {
          margin: 24px 0 0;
          max-width: 42ch;
          color: rgba(17, 17, 17, 0.64);
          line-height: 1.9;
        }

        .va-hero-map {
          position: relative;
          min-height: 64vh;
          border: 1px solid rgba(17, 17, 17, 0.08);
          background: #f1efe8;
          overflow: hidden;
        }

        .va-map-overlay {
          position: absolute;
          left: 24px;
          top: 24px;
          z-index: 5;
          max-width: 240px;
          padding: 0;
          pointer-events: none;
        }

        .va-map-tag,
        .va-map-sub {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 10px;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        .va-map-tag {
          color: rgba(17, 17, 17, 0.46);
        }

        .va-map-title {
          margin-top: 10px;
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
          font-size: 34px;
          line-height: 0.98;
          letter-spacing: -0.04em;
        }

        .va-map-sub {
          margin-top: 12px;
          color: rgba(17, 17, 17, 0.5);
          max-width: 20ch;
        }

        .va-map-loading {
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, rgba(17, 17, 17, 0.04), rgba(17, 17, 17, 0.02));
        }

        .va-plaza {
          padding-top: 58px;
          padding-bottom: 84px;
        }

        .va-section-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 24px;
          border-top: 1px solid rgba(17, 17, 17, 0.1);
          padding-top: 18px;
          margin-bottom: 24px;
        }

        .va-section-label {
          color: rgba(17, 17, 17, 0.44);
          margin-bottom: 10px;
        }

        .va-section-title {
          margin: 0;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
          font-size: clamp(28px, 3vw, 48px);
          font-weight: 500;
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .va-section-count {
          color: rgba(17, 17, 17, 0.46);
          text-align: right;
        }

        .va-section-count span {
          display: block;
          font-size: 32px;
          line-height: 1;
          letter-spacing: -0.02em;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
          text-transform: none;
        }

        .va-section-count small {
          display: block;
          margin-top: 6px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 10px;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        .va-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px 22px;
        }

        .va-card {
          cursor: pointer;
          outline: none;
        }

        .va-card:focus-visible {
          outline: 2px solid rgba(17, 17, 17, 0.22);
          outline-offset: 8px;
        }

        .va-card-frame {
          position: relative;
          aspect-ratio: 4 / 3;
          border: 1px solid rgba(17, 17, 17, 0.08);
          background: #f1efe8;
          overflow: hidden;
        }

        .va-card-index {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 3;
          color: rgba(17, 17, 17, 0.48);
        }

        .va-card-placeholder,
        .va-preview-loading {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          background: #f1efe8;
        }

        .va-card-glyph {
          width: 54px;
          height: 54px;
          border: 1px solid rgba(17, 17, 17, 0.22);
        }

        .va-card-meta {
          padding-top: 12px;
        }

        .va-card-meta h3 {
          margin: 0;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
          font-size: 18px;
          font-weight: 500;
          line-height: 1.2;
          letter-spacing: -0.01em;
        }

        .va-footer {
          padding-bottom: 36px;
        }

        .va-footer-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          border-top: 1px solid rgba(17, 17, 17, 0.1);
          padding-top: 24px;
        }

        .va-footer-label {
          color: rgba(17, 17, 17, 0.44);
          margin-bottom: 10px;
        }

        .va-footer-title {
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
          font-size: 22px;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .va-footer-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          color: rgba(17, 17, 17, 0.52);
        }

        .va-ig {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(17, 17, 17, 0.14);
          color: rgba(17, 17, 17, 0.8);
          transition: border-color 180ms ease, transform 180ms ease;
        }

        .va-ig:hover {
          border-color: rgba(17, 17, 17, 0.36);
          transform: translateY(-1px);
        }

        .va-loading {
          min-height: 100vh;
          display: grid;
          place-content: center;
          gap: 16px;
          padding: 32px;
          background: #f7f6f2;
          color: #111111;
        }

        .va-loading-kicker {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 10px;
          color: rgba(17, 17, 17, 0.48);
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        .va-loading-line,
        .va-preview-loading {
          width: 220px;
          height: 1px;
          background: rgba(17, 17, 17, 0.18);
          position: relative;
          overflow: hidden;
        }

        .va-loading-line::after {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 38%;
          background: rgba(17, 17, 17, 0.58);
          animation: va-load 1.3s ease-in-out infinite;
        }

        .va-loading-line.short {
          width: 160px;
        }

        .va-loading-line.short::after {
          width: 28%;
        }

        .va-reveal {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 520ms ease, transform 520ms ease;
        }

        .va-reveal.va-in {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes va-load {
          0% {
            transform: translateX(-18%);
          }
          100% {
            transform: translateX(220%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }

          .va-reveal,
          .va-loading-line::after,
          .va-admin-link,
          .va-ig,
          .va-card {
            transition: none;
            animation: none;
          }
        }

        @media (max-width: 1024px) {
          .va-hero,
          .va-grid {
            grid-template-columns: 1fr;
          }

          .va-hero-copy {
            min-height: 0;
          }

          .va-hero-body {
            max-width: 56ch;
          }
        }

        @media (max-width: 768px) {
          .va-topbar,
          .va-hero,
          .va-plaza,
          .va-footer {
            padding-left: 20px;
            padding-right: 20px;
          }

          .va-topbar {
            flex-direction: column;
            align-items: flex-start;
          }

          .va-topbar-right {
            width: 100%;
            justify-content: space-between;
          }

          .va-hero {
            padding-top: 72px;
            gap: 22px;
          }

          .va-hero-map {
            min-height: 56vh;
          }

          .va-map-overlay {
            left: 18px;
            top: 18px;
          }

          .va-grid {
            gap: 22px;
          }

          .va-footer-top {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </>
  );
}
