import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { FaTimes } from 'react-icons/fa';

const ModelPreview = dynamic(() => import('./ModelPreview'), { ssr: false });

export default function ModelPopup({ selectedLocation, isClosing, onClose }) {
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!selectedLocation) return null;

  return (
    <div className={`va-popup-shell ${isClosing ? 'is-closing' : ''}`}>
      <div className="va-popup-backdrop" onClick={onClose} />

      <div ref={popupRef} className="va-popup-panel" role="dialog" aria-modal="true">
        <button className="va-popup-close" onClick={onClose} aria-label="Close record">
          <FaTimes size={14} />
        </button>

        <div className="va-popup-media">
          <div className="va-popup-stage">
            <ModelPreview
              modelPath={selectedLocation.highModelPath || selectedLocation.modelPath}
              scale={1}
              intensity={selectedLocation.intensity || 1.5}
              rotationY={selectedLocation.rotationY || 0}
              autoRotateSpeed={selectedLocation.autoRotateSpeed || 2}
              adjustCamera={1.8}
            />
          </div>
        </div>

        <div className="va-popup-content">
          <div className="va-popup-meta">
            <span>{selectedLocation.location}</span>
            <span>{selectedLocation.date}</span>
          </div>

          <h3>{selectedLocation.name}</h3>

          <p className="va-popup-body">
            {selectedLocation.travelNote || selectedLocation.description || 'No note recorded.'}
          </p>

          <div className="va-popup-footer">
            <span className="va-popup-status">Minimal record</span>
            <button className="va-popup-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .va-popup-shell {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 18px;
        }

        .va-popup-shell.is-closing {
          pointer-events: none;
        }

        .va-popup-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(17, 17, 17, 0.58);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .va-popup-panel {
          position: relative;
          width: min(1120px, 100%);
          max-height: min(88vh, 920px);
          overflow: hidden;
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
          background: #f7f6f2;
          border: 1px solid rgba(17, 17, 17, 0.1);
          box-shadow: 0 24px 80px rgba(17, 17, 17, 0.18);
          transition: transform 260ms ease, opacity 260ms ease;
        }

        .va-popup-shell.is-closing .va-popup-panel {
          opacity: 0;
          transform: scale(0.985) translateY(10px);
        }

        .va-popup-close {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 3;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(17, 17, 17, 0.12);
          background: rgba(247, 246, 242, 0.92);
          color: #111111;
          transition: border-color 180ms ease, transform 180ms ease;
        }

        .va-popup-close:hover {
          border-color: rgba(17, 17, 17, 0.28);
          transform: translateY(-1px);
        }

        .va-popup-media {
          min-height: 0;
          border-right: 1px solid rgba(17, 17, 17, 0.08);
          background: #f1efe8;
          padding: 24px;
        }

        .va-popup-stage {
          width: 100%;
          height: 100%;
          min-height: 0;
          border: 1px solid rgba(17, 17, 17, 0.08);
          background: rgba(255, 255, 255, 0.24);
        }

        .va-popup-content {
          display: flex;
          flex-direction: column;
          padding: 28px;
        }

        .va-popup-meta,
        .va-popup-status {
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 10px;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        .va-popup-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          color: rgba(17, 17, 17, 0.48);
          margin-bottom: 16px;
        }

        .va-popup-meta span {
          padding-right: 12px;
          border-right: 1px solid rgba(17, 17, 17, 0.12);
        }

        .va-popup-meta span:last-child {
          padding-right: 0;
          border-right: 0;
        }

        .va-popup-content h3 {
          margin: 0;
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
          font-size: clamp(34px, 4.4vw, 64px);
          line-height: 0.96;
          letter-spacing: -0.05em;
          font-weight: 400;
          text-wrap: balance;
        }

        .va-popup-body {
          margin: 22px 0 0;
          max-width: 42ch;
          color: rgba(17, 17, 17, 0.72);
          font-size: 15px;
          line-height: 1.95;
          font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        }

        .va-popup-footer {
          margin-top: auto;
          padding-top: 24px;
          border-top: 1px solid rgba(17, 17, 17, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
        }

        .va-popup-status {
          color: rgba(17, 17, 17, 0.5);
        }

        .va-popup-button {
          min-height: 40px;
          padding: 0 16px;
          border: 1px solid rgba(17, 17, 17, 0.16);
          background: #111111;
          color: #f7f6f2;
          transition: transform 180ms ease, border-color 180ms ease;
        }

        .va-popup-button:hover {
          transform: translateY(-1px);
          border-color: rgba(17, 17, 17, 0.3);
        }

        @media (max-width: 960px) {
          .va-popup-panel {
            grid-template-columns: 1fr;
            max-height: 92vh;
          }

          .va-popup-media {
            border-right: 0;
            border-bottom: 1px solid rgba(17, 17, 17, 0.08);
            min-height: 42vh;
          }
        }

        @media (max-width: 640px) {
          .va-popup-shell {
            padding: 10px;
          }

          .va-popup-content,
          .va-popup-media {
            padding: 18px;
          }

          .va-popup-footer {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
