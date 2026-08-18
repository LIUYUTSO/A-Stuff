import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { ADMIN_ENABLED } from '../utils/auth';
import {
  FaArrowRight,
  FaCheckCircle,
  FaCloudUploadAlt,
  FaExclamationTriangle,
  FaKey,
  FaLock,
  FaPen,
  FaSignOutAlt,
  FaSpinner,
  FaTrash,
} from 'react-icons/fa';

const ModelPreview = dynamic(() => import('../components/ModelPreview'), {
  ssr: false,
  loading: () => <div className="va-preview-loading" aria-hidden="true" />,
});

// Two layers of "the data": `data/collections.js` (committed, what the
// public site actually ships) and whatever's sitting in the admin form that
// hasn't been published via "Sync to Cloud" yet. That second layer used to
// live only in React state — a refresh silently dropped it back to the
// committed file with no warning. Mirroring it into localStorage means a
// refresh restores the in-progress draft instead of losing it; it's cleared
// the moment a sync actually lands the data in the committed file.
const DRAFT_STORAGE_KEY = 'va-admin-collections-draft';

const initialDraft = {
  name: '',
  location: '',
  date: '',
  modelPath: '',
  highModelPath: '',
  thumbnail: '',
  scale: 1,
  intensity: 1.5,
  rotationY: 0,
  autoRotateSpeed: 2,
  // Geometric-origin correction (position offset) + camera framing distance —
  // tune a model's initial framing here instead of re-exporting from Blender.
  originOffset: [0, 0, 0],
  cameraDistance: 1.8,
  coordinates: [35.6762, 139.6503],
  travelNote: '',
};

const WIZARD_STEPS = ['Model', 'Details', 'Note'];

// The viewer/tuning knobs, isolated from the rest of initialDraft — reused
// both by the "+ Back to origin" reset and by handleChooseFile (a new model
// file means the previous model's framing no longer applies).
function tuningDefaults() {
  return {
    intensity: initialDraft.intensity,
    rotationY: initialDraft.rotationY,
    autoRotateSpeed: initialDraft.autoRotateSpeed,
    scale: initialDraft.scale,
    cameraDistance: initialDraft.cameraDistance,
    originOffset: [...initialDraft.originOffset],
  };
}

function normalizeDraft(item) {
  return {
    ...initialDraft,
    ...item,
    coordinates: Array.isArray(item?.coordinates) ? item.coordinates : initialDraft.coordinates,
    originOffset: Array.isArray(item?.originOffset) ? item.originOffset : initialDraft.originOffset,
    scale: Number(item?.scale ?? 1),
    intensity: Number(item?.intensity ?? 1.5),
    rotationY: Number(item?.rotationY ?? 0),
    autoRotateSpeed: Number(item?.autoRotateSpeed ?? 2),
    cameraDistance: Number(item?.cameraDistance ?? 1.8),
  };
}

function formatSnippet(text) {
  if (!text) return 'No note.';
  return text.length > 96 ? `${text.slice(0, 95)}…` : text;
}

function AdminPanel() {
  const uploadInputRef = useRef(null);
  // The raw File for a not-yet-uploaded model. Preview is instant (a local
  // blob: URL, no network); the actual R2 upload happens once at the end of
  // the wizard, in handleSubmit.
  const pendingFileRef = useRef(null);
  const previewObjectUrlRef = useRef(null);
  const previewFrameRef = useRef(null);
  // Captured when leaving step 0 (see handleAdvanceFromModelStep) — the
  // preview canvas only exists in the DOM while wizardStep is 0, so trying
  // to read it again at final-submit time (step 2) finds nothing and the
  // thumbnail silently falls back to a blank placeholder.
  const thumbnailDataRef = useRef(undefined);

  const [isLoading, setIsLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState({
    username: '',
    displayName: '',
    hasPasskey: false,
    credentialCount: 0,
  });
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [collections, setCollections] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [draft, setDraft] = useState(initialDraft);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  // 'idle' | 'uploading' | 'success' | 'error' — drives the full-screen lock
  // overlay during the final "Upload to R2 & save" step.
  const [uploadPhase, setUploadPhase] = useState('idle');
  const [uploadError, setUploadError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refreshPasskeyStatus = useCallback(async (targetUsername) => {
    if (!targetUsername) return null;

    try {
      const res = await fetch(`/api/passkey/status?username=${encodeURIComponent(targetUsername)}`);
      const data = await res.json();
      if (res.ok) setPasskeyStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [{ locationInfo }, modelsRes, sessionData, passkeyData] = await Promise.all([
          import('../data/collections'),
          fetch('/api/getModels'),
          fetch('/api/session'),
          fetch('/api/passkey/status'),
        ]);

        if (!alive) return;

        let restoredDraft = null;
        try {
          const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
          if (stored) restoredDraft = JSON.parse(stored);
        } catch {
          restoredDraft = null;
        }

        if (Array.isArray(restoredDraft)) {
          setCollections(restoredDraft);
          setNotice('Restored unsynced changes from this browser — click "Sync to Cloud" to publish them.');
        } else {
          setCollections(locationInfo || []);
        }

        const modelsJson = await modelsRes.json();
        setAvailableModels(modelsJson.models || []);

        if (sessionData.ok) {
          const sessionJson = await sessionData.json();
          if (sessionJson.authorized) {
            setAuthorized(true);
            setSession(sessionJson);
            setUsername(sessionJson.username || '');
          }
        }

        if (passkeyData.ok) {
          const passkeyJson = await passkeyData.json();
          setPasskeyStatus(passkeyJson);
          setUsername((current) => current || passkeyJson.username || '');
        }

        setPasskeySupported(browserSupportsWebAuthn());

        try {
          setPlatformAvailable(await platformAuthenticatorIsAvailable());
        } catch {
          setPlatformAvailable(false);
        }
      } catch (error) {
        console.error('Initial admin load failed:', error);
        setLoginMessage('Could not load the admin surface.');
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  // Mirror `collections` into localStorage as they change so an unsynced
  // add/edit/delete survives a refresh (see DRAFT_STORAGE_KEY comment above).
  // Skipped while still loading so the initial empty state doesn't stomp a
  // draft we haven't restored yet.
  useEffect(() => {
    if (isLoading) return;
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(collections));
    } catch {
      // localStorage unavailable (private browsing, quota, etc.) — the
      // in-memory state still works for the current session, it just won't
      // survive a refresh.
    }
  }, [collections, isLoading]);

  useEffect(() => {
    if (authorized || !username) return undefined;

    const timer = setTimeout(() => {
      refreshPasskeyStatus(username);
    }, 250);

    return () => clearTimeout(timer);
  }, [authorized, refreshPasskeyStatus, username]);

  // `.va-reveal` elements are opacity:0 until `.va-in` is added — this used to
  // never happen, so the whole login form / dashboard body stayed invisible.
  // Fade everything in once the relevant screen has actually mounted.
  useEffect(() => {
    if (isLoading) return undefined;

    const frame = requestAnimationFrame(() => {
      document.querySelectorAll('.va-reveal:not(.va-in)').forEach((el) => {
        el.classList.add('va-in');
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isLoading, authorized, collections, availableModels]);

  // (Used to GSAP-animate this open/closed. Animating the height of a box
  // that has a live Three.js canvas inside it fights the canvas's own
  // resize handling — it corrupted the whole page in practice. Not worth
  // it; just show/hide instantly.)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!locationSearch || locationSearch.length < 3) {
        setSearchResults([]);
        return;
      }

      setSearchBusy(true);
      try {
        const res = await fetch(`/api/geocode?query=${encodeURIComponent(locationSearch)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (error) {
        console.error('Geocode lookup failed:', error);
        setSearchResults([]);
      } finally {
        setSearchBusy(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [locationSearch]);

  const handlePasswordLogin = useCallback(
    async (event) => {
      event.preventDefault();
      setLoginBusy(true);
      setLoginMessage('');

      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        setAuthorized(true);
        setSession({ authorized: true, username: data.username, mode: data.mode });
        setPassword('');
        await refreshPasskeyStatus(data.username);
        setNotice('Signed in.');
      } catch (error) {
        setLoginMessage(error.message || 'Login failed.');
      } finally {
        setLoginBusy(false);
      }
    },
    [password, refreshPasskeyStatus, username]
  );

  const handlePasskeyLogin = useCallback(async () => {
    if (!passkeySupported) {
      setLoginMessage('This browser does not support passkeys.');
      return;
    }

    if (!username) {
      setLoginMessage('Choose an account first.');
      return;
    }

    setPasskeyBusy(true);
    setLoginMessage('');

    try {
      const optionsRes = await fetch('/api/passkey/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData.error || 'Passkey is not available.');

      const response = await startAuthentication({ optionsJSON: optionsData.optionsJSON });

      const verifyRes = await fetch('/api/passkey/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, response }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Passkey login failed.');

      setAuthorized(true);
      setSession({ authorized: true, username: verifyData.username, mode: verifyData.mode });
      setNotice('Passkey login complete.');
    } catch (error) {
      setLoginMessage(error.message || 'Passkey login failed.');
    } finally {
      setPasskeyBusy(false);
    }
  }, [passkeySupported, username]);

  const handleRegisterPasskey = useCallback(async () => {
    if (!authorized || !session?.username) return;
    if (!passkeySupported) {
      setNotice('This browser cannot create passkeys.');
      return;
    }

    setPasskeyBusy(true);
    setNotice('');

    try {
      const optionsRes = await fetch('/api/passkey/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData.error || 'Passkey setup unavailable.');

      const response = await startRegistration({ optionsJSON: optionsData.optionsJSON });

      const verifyRes = await fetch('/api/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Passkey setup failed.');

      await refreshPasskeyStatus(session.username);
      setNotice('Passkey registered for faster sign-in.');
    } catch (error) {
      setNotice(error.message || 'Passkey setup failed.');
    } finally {
      setPasskeyBusy(false);
    }
  }, [authorized, passkeySupported, refreshPasskeyStatus, session?.username]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/session', { method: 'DELETE' });
    } finally {
      setAuthorized(false);
      setSession(null);
      setPassword('');
      setLoginMessage('');
      setNotice('Signed out.');
    }
  }, []);

  const handleSelectLocation = useCallback((result) => {
    setDraft((current) => ({
      ...current,
      location: result.name.split(',')[0],
      coordinates: result.coordinates,
    }));
    setLocationSearch(result.name);
    setSearchResults([]);
  }, []);

  const revokePendingPreview = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    pendingFileRef.current = null;
    thumbnailDataRef.current = undefined;
  };

  const clearDraft = useCallback(() => {
    revokePendingPreview();
    setDraft(initialDraft);
    setEditMode(false);
    setEditId(null);
    setWizardStep(0);
    setUploadPhase('idle');
    setUploadError('');
    setLocationSearch('');
    setSearchResults([]);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();

      let recordDraft = draft;

      // A freshly-chosen file is still local (blob: URL) at this point —
      // this is the moment it actually goes to R2, low-poly + thumbnail
      // generation included.
      if (pendingFileRef.current) {
        const file = pendingFileRef.current;
        setUploadPhase('uploading');
        setUploadError('');
        try {
          // Captured back when you left step 0 (handleAdvanceFromModelStep)
          // — the preview canvas only exists in the DOM on step 0, so
          // there's nothing left to read from previewFrameRef by the time
          // we get here on step 2.
          const thumbnailData = thumbnailDataRef.current;

          // Step 1: get a signed URL and PUT the raw file straight to R2.
          // Vercel Functions cap request bodies at 4.5MB (platform-level —
          // no config can raise it), well under a real high-poly .glb, so
          // the file never goes through our own API at all.
          const urlRes = await fetch('/api/r2-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentType: file.type || 'model/gltf-binary' }),
          });
          const urlData = await urlRes.json();
          if (!urlRes.ok) throw new Error(urlData.error || 'Could not start upload');

          // Large files (60MB+ high-poly .glb) over a real network hit
          // transient drops — Safari specifically will throw "the network
          // connection was lost" mid-transfer sometimes. Retry a couple
          // times with a short backoff before giving up; the presigned URL
          // is good for 15 minutes (see r2-upload-url.js), plenty of room.
          let putRes;
          let putError;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              putRes = await fetch(urlData.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type || 'model/gltf-binary' },
                body: file,
              });
              putError = undefined;
              break;
            } catch (err) {
              putError = err;
              if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
            }
          }
          if (putError) throw new Error(`Upload to R2 failed: ${putError.message} (retried 3x)`);
          if (!putRes.ok) throw new Error(`Upload to R2 failed (${putRes.status})`);

          // Step 2: tell the server to pull it back down, generate the
          // low-poly + store the thumbnail. Only the R2 key + a small PNG
          // travel through this request — comfortably under the 4.5MB cap.
          const processRes = await fetch('/api/r2-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: urlData.key, thumbnail: thumbnailData }),
          });

          const data = await processRes.json();
          if (!processRes.ok) {
            throw new Error(`${data.message || data.error || 'Processing failed'} (${processRes.status})`);
          }

          const urls = data.urls || {};
          recordDraft = {
            ...draft,
            modelPath: urls.low || draft.modelPath,
            highModelPath: urls.high || '',
            thumbnail: urls.thumbnail || '',
          };
          setDraft(recordDraft);
          if (urls.low) {
            setAvailableModels((current) => (current.includes(urls.low) ? current : [...current, urls.low]));
          }
          revokePendingPreview();

          // Brief success beat so the lock screen doesn't just vanish —
          // then fall through to save the record below.
          setUploadPhase('success');
          await new Promise((resolve) => setTimeout(resolve, 600));
        } catch (error) {
          // Deliberately don't clear the draft or the pending file here —
          // everything typed so far (name/date/location/note) and the
          // chosen model stay put so nothing has to be retyped. The lock
          // screen shows the error and waits for you to dismiss it.
          setUploadError(error.message || 'Model upload failed — record was not saved.');
          setUploadPhase('error');
          return;
        }
        setUploadPhase('idle');
      }

      if (editMode) {
        setCollections((current) =>
          current.map((item) => (item.id === editId ? { ...recordDraft, id: editId } : item))
        );
        setNotice('Record updated locally.');
      } else {
        setCollections((current) => [...current, { ...recordDraft, id: Date.now() }]);
        setNotice('Record added locally.');
      }

      clearDraft();
    },
    [clearDraft, draft, editId, editMode]
  );

  const handleEdit = useCallback((item) => {
    revokePendingPreview();
    setEditMode(true);
    setEditId(item.id);
    setDraft(normalizeDraft(item));
    setWizardStep(0);
    setLocationSearch(item.location || '');
    setNotice(`Editing ${item.name}.`);
  }, []);

  const handleDelete = useCallback((itemId) => {
    if (!window.confirm('Delete this archive record?')) return;
    setCollections((current) => current.filter((item) => item.id !== itemId));
    setNotice('Record removed locally.');
  }, []);

  // Fast, local, no network: just points the preview at a blob: URL so you
  // can frame the model immediately. The real upload happens once, at the
  // end of the wizard (see handleSubmit).
  const handleChooseFile = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    // No client-side size cap: upload now goes straight to R2 (see
    // handleSubmit), not through a Vercel Function, so there's no 4.5MB
    // platform ceiling to protect against here — and WebGL has been
    // confirmed fine rendering full high-poly (60MB+) source files.

    revokePendingPreview();
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    pendingFileRef.current = file;

    // A new file means the old tuning values (framed for a different model)
    // don't apply anymore — reset brightness/angle/spin/scale/camera/origin
    // back to defaults along with it.
    setDraft((current) => ({
      ...current,
      ...tuningDefaults(),
      modelPath: objectUrl,
      highModelPath: '',
      thumbnail: '',
    }));
    setNotice(`Previewing ${file.name} — not uploaded yet.`);
  }, []);

  // Resets the *tuning* fields back to their defaults — brightness, angle,
  // spin, scale, camera distance, origin offset. Does NOT touch modelPath or
  // anything from later steps (name/date/location/note): this is "put the
  // knobs back where they started," not "forget the model was chosen."
  const resetToOrigin = useCallback(() => {
    setDraft((current) => ({ ...current, ...tuningDefaults() }));
  }, []);

  // The preview canvas is only mounted while wizardStep is 0, so this is the
  // last moment it's possible to grab a snapshot of it — capture now and
  // hang onto it in a ref for handleSubmit to use later, once the canvas is
  // long gone from the DOM.
  const handleAdvanceFromModelStep = useCallback(() => {
    const canvas = previewFrameRef.current?.querySelector('canvas');
    try {
      thumbnailDataRef.current = canvas?.toDataURL('image/png').split(',')[1];
    } catch {
      thumbnailDataRef.current = undefined; // tainted canvas — submit falls back to a placeholder
    }
    setWizardStep(1);
  }, []);

  const syncCollectionsToCloud = useCallback(async () => {
    if (!window.confirm('Publish the current archive manifest to GitHub?')) return;

    setIsSyncing(true);
    setNotice('');

    try {
      // The public site statically imports data/collections.js at build time
      // (see pages/index.js), so "publish" means committing a fresh copy of
      // that file to GitHub — Vercel picks up the push and redeploys.
      const fileBody = `export const locationInfo = ${JSON.stringify(collections, null, 2)};\n`;

      const res = await fetch('/api/github-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fileBody,
          path: 'data/collections.js',
          message: 'CMS Update: sync archive manifest',
          isBinary: false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      // The committed file is now the source of truth again — drop the
      // local draft so the next load doesn't shadow it with stale state.
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }

      setNotice('Archive manifest published — Vercel will redeploy shortly.');
    } catch (error) {
      setNotice(error.message || 'Sync failed.');
    } finally {
      setIsSyncing(false);
    }
  }, [collections]);

  if (isLoading) {
    return (
      <div className="va-loading" aria-busy="true" aria-label="Loading admin">
        <div className="va-loading-kicker">Loading admin</div>
        <div className="va-loading-line" />
        <div className="va-loading-line short" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="va-admin-page">
        <main className="va-admin-shell">
          <header className="va-admin-topbar">
            <div>
              <Link href="/" className="va-brand">
                A-Stuff
              </Link>
              <div className="va-brand-sub">Admin / quiet access surface</div>
            </div>
            <div className="va-topbar-note">
              {passkeyStatus.hasPasskey ? 'Passkey ready' : 'Passkey not set'}
            </div>
          </header>

          <section className="va-admin-hero">
            <div className="va-admin-copy">
              <div className="va-kicker va-reveal">Secure archive / 2026 flow</div>
              <h1 className="va-admin-title va-reveal">Quiet control for the archive.</h1>
              <p className="va-admin-body va-reveal">
                Sign in with an account and password, then set up a passkey for the next visit. The surface stays
                calm, minimal, and in the same language as the public site.
              </p>
              <div className="va-admin-chips va-reveal">
                <span>Password</span>
                <span>Passkey</span>
                <span>Single quiet workspace</span>
              </div>
            </div>

            <form className="va-admin-panel va-reveal" onSubmit={handlePasswordLogin}>
              <div className="va-panel-head">
                <div>
                  <div className="va-section-label">Sign in</div>
                  <h2 className="va-panel-title">Account access</h2>
                </div>
                <div className="va-panel-meta">
                  <span>{passkeyStatus.credentialCount || 0} key(s)</span>
                  <span>{platformAvailable ? 'Platform available' : 'No platform key'}</span>
                </div>
              </div>

              <label className="va-field">
                <span>Account</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                />
              </label>

              <label className="va-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter access password"
                  autoComplete="current-password"
                />
              </label>

              <div className="va-panel-actions">
                <button type="submit" className="va-button-primary" disabled={loginBusy}>
                  {loginBusy ? <FaSpinner className="va-spin" /> : <FaLock />}
                  <span>Enter workspace</span>
                </button>

                <button
                  type="button"
                  className="va-button-secondary"
                  onClick={handlePasskeyLogin}
                  disabled={!passkeySupported || passkeyBusy || !passkeyStatus.hasPasskey}
                >
                  {passkeyBusy ? <FaSpinner className="va-spin" /> : <FaKey />}
                  <span>Use passkey</span>
                </button>
              </div>

              {loginMessage && <p className="va-panel-message">{loginMessage}</p>}
              {notice && !loginMessage && <p className="va-panel-message">{notice}</p>}

              <div className="va-panel-foot">
                <span>{passkeySupported ? 'WebAuthn ready' : 'WebAuthn unavailable'}</span>
                <span>{passkeyStatus.hasPasskey ? 'Quick login enabled' : 'Register after sign in'}</span>
              </div>
            </form>
          </section>
        </main>

        <style jsx global>{adminStyles}</style>
      </div>
    );
  }

  const rowStats = [
    { label: 'Records', value: String(collections.length).padStart(2, '0') },
    { label: 'Models', value: String(availableModels.length).padStart(2, '0') },
    { label: 'Passkeys', value: String(passkeyStatus.credentialCount || 0).padStart(2, '0') },
    { label: 'Session', value: session?.mode || 'active' },
  ];

  return (
    <div className="va-admin-page">
      {uploadPhase !== 'idle' && (
        <div className="va-lock-screen" role="alertdialog" aria-live="assertive">
          <div className="va-lock-card">
            {uploadPhase === 'uploading' && (
              <>
                <FaSpinner className="va-spin va-lock-icon" />
                <p className="va-lock-title">Uploading to R2…</p>
                <p className="va-lock-body">Sending the model, compressing a low-poly copy, saving the thumbnail.</p>
              </>
            )}
            {uploadPhase === 'success' && (
              <>
                <FaCheckCircle className="va-lock-icon va-lock-icon-ok" />
                <p className="va-lock-title">Saved.</p>
              </>
            )}
            {uploadPhase === 'error' && (
              <>
                <FaExclamationTriangle className="va-lock-icon va-lock-icon-err" />
                <p className="va-lock-title">Upload failed</p>
                <p className="va-lock-body">{uploadError}</p>
                <p className="va-lock-body va-lock-reassure">Nothing was lost — the form is exactly as you left it.</p>
                <button type="button" className="va-button-secondary" onClick={() => setUploadPhase('idle')}>
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <main className="va-admin-shell">
        <header className="va-admin-topbar">
          <div>
            <Link href="/" className="va-brand">
              A-Stuff
            </Link>
            <div className="va-brand-sub">Admin / quiet workspace</div>
          </div>

          <div className="va-topbar-actions">
            <button className="va-button-secondary" type="button" onClick={handleRegisterPasskey} disabled={passkeyBusy}>
              {passkeyBusy ? <FaSpinner className="va-spin" /> : <FaKey />}
              <span>{passkeyStatus.hasPasskey ? 'Refresh passkey' : 'Register passkey'}</span>
            </button>
            <button className="va-button-secondary" type="button" onClick={syncCollectionsToCloud} disabled={isSyncing}>
              {isSyncing ? <FaSpinner className="va-spin" /> : <FaCloudUploadAlt />}
              <span>{isSyncing ? 'Working' : 'Sync manifest'}</span>
            </button>
            <button className="va-button-secondary" type="button" onClick={handleLogout}>
              <FaSignOutAlt />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <section className="va-summary-strip">
          {rowStats.map((item) => (
            <div key={item.label} className="va-summary-chip va-reveal">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
          <div className="va-summary-chip va-reveal">
            <span>Passkey</span>
            <strong>{passkeyStatus.hasPasskey ? 'Ready' : 'Not set'}</strong>
          </div>
        </section>

        <section className="va-admin-grid">
          <article className="va-editor-panel va-reveal">
            <div className="va-panel-head">
              <div>
                <div className="va-section-label">{editMode ? 'Edit record' : 'New record'}</div>
                <h2 className="va-panel-title">{editMode ? 'Refine the archive entry' : 'Add a quiet object'}</h2>
              </div>
            </div>

            <div className="va-wizard-steps">
              {WIZARD_STEPS.map((label, index) => (
                <div key={label} className={`va-wizard-step ${index === wizardStep ? 'is-active' : ''} ${index < wizardStep ? 'is-done' : ''}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="va-form">
              {wizardStep === 0 && (
                <>
                  <div className="va-upload-shell">
                    <span>Model file</span>
                    <button
                      type="button"
                      className="va-upload-button"
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      <FaCloudUploadAlt />
                      <span>{draft.modelPath ? 'Choose a different file' : 'Choose model file'}</span>
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept=".glb,.gltf"
                      onChange={handleChooseFile}
                      className="va-hidden-file"
                    />
                    <p className="va-input-note">
                      {pendingFileRef.current
                        ? 'Rendered locally — not uploaded until you finish this record.'
                        : editMode
                          ? 'Editing an already-published model.'
                          : 'Pick a .glb/.gltf file to preview it instantly in the browser.'}
                    </p>
                  </div>

                  <div className="va-model-reveal">
                    {draft.modelPath && (
                      <>
                        {/* Render layer (the 3D canvas) and controls layer are deliberately
                            separate containers — a control never gets nested inside the
                            background/media element it sits on top of. See
                            A-Brain/A-Sponge/signals/2026-08-17-overlay-controls-layer.md */}
                        <div className="va-preview-stage">
                          <div className="va-preview-frame" ref={previewFrameRef}>
                            <ModelPreview
                              modelPath={draft.modelPath}
                              scale={draft.scale}
                              intensity={draft.intensity}
                              rotationY={draft.rotationY}
                              autoRotateSpeed={draft.autoRotateSpeed}
                              cameraDistance={draft.cameraDistance}
                              position={draft.originOffset}
                              fov={50}
                            />
                          </div>
                          <div className="va-preview-controls">
                            <button
                              type="button"
                              className="va-origin-reset"
                              onClick={resetToOrigin}
                              title="Origin offset — nudges an off-center model back into frame instead of re-exporting it."
                            >
                              + Back to origin
                            </button>
                          </div>
                        </div>

                        <div className="va-slider-grid">
                          <label className="va-slider">
                            <span>Brightness</span>
                            <strong>{Number(draft.intensity).toFixed(1)}x</strong>
                            <input
                              type="range"
                              min="0.5"
                              max="4"
                              step="0.1"
                              value={draft.intensity}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, intensity: Number(event.target.value) }))
                              }
                            />
                          </label>

                          <label className="va-slider">
                            <span>Initial angle</span>
                            <strong>{draft.rotationY}°</strong>
                            <input
                              type="range"
                              min="0"
                              max="360"
                              step="1"
                              value={draft.rotationY}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, rotationY: Number(event.target.value) }))
                              }
                            />
                          </label>

                          <label className="va-slider">
                            <span>Spin speed</span>
                            <strong>{Number(draft.autoRotateSpeed).toFixed(1)}</strong>
                            <input
                              type="range"
                              min="0"
                              max="10"
                              step="0.5"
                              value={draft.autoRotateSpeed}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, autoRotateSpeed: Number(event.target.value) }))
                              }
                            />
                          </label>

                          <label className="va-slider">
                            <span>Scale</span>
                            <strong>{Number(draft.scale).toFixed(2)}x</strong>
                            <input
                              type="range"
                              min="0.1"
                              max="5"
                              step="0.05"
                              value={draft.scale}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, scale: Number(event.target.value) }))
                              }
                            />
                          </label>

                          <label className="va-slider">
                            <span>Camera distance</span>
                            <strong>{Number(draft.cameraDistance).toFixed(1)}x</strong>
                            <input
                              type="range"
                              min="0.5"
                              max="4"
                              step="0.1"
                              value={draft.cameraDistance}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, cameraDistance: Number(event.target.value) }))
                              }
                            />
                          </label>
                        </div>

                        <div className="va-origin-grid">
                          {['X', 'Y', 'Z'].map((axis, index) => (
                            <label key={axis} className="va-field va-field-compact">
                              <span>{axis}</span>
                              <input
                                type="number"
                                step="0.05"
                                value={draft.originOffset[index]}
                                onChange={(event) =>
                                  setDraft((current) => {
                                    const next = [...current.originOffset];
                                    next[index] = Number(event.target.value);
                                    return { ...current, originOffset: next };
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="va-form-actions">
                    <button
                      type="button"
                      className="va-button-primary"
                      disabled={!draft.modelPath}
                      onClick={handleAdvanceFromModelStep}
                    >
                      <FaArrowRight />
                      <span>Next: details</span>
                    </button>
                    {editMode && (
                      <button type="button" className="va-button-secondary" onClick={clearDraft}>
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              )}

              {wizardStep === 1 && (
                <>
                  <div className="va-grid-two">
                    <label className="va-field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Artifact name"
                        required
                      />
                    </label>

                    <label className="va-field">
                      <span>Date</span>
                      <input
                        type="text"
                        value={draft.date}
                        onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
                        placeholder="YYYY-MM"
                        required
                      />
                    </label>

                    <label className="va-field va-field-wide">
                      <span>Location</span>
                      <input
                        type="text"
                        value={locationSearch}
                        onChange={(event) => setLocationSearch(event.target.value)}
                        placeholder="Search city, country"
                        autoComplete="off"
                        required
                      />
                      {searchResults.length > 0 && (
                        <div className="va-search-popover">
                          {searchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              className="va-search-item"
                              onClick={() => handleSelectLocation(result)}
                            >
                              <span>{result.name}</span>
                              <small>Use coordinates</small>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchBusy && <div className="va-input-note">Searching locations…</div>}
                    </label>

                    <label className="va-field">
                      <span>Latitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={draft.coordinates[0]}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            coordinates: [Number(event.target.value), current.coordinates[1]],
                          }))
                        }
                      />
                    </label>

                    <label className="va-field">
                      <span>Longitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={draft.coordinates[1]}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            coordinates: [current.coordinates[0], Number(event.target.value)],
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="va-form-actions">
                    <button type="button" className="va-button-secondary" onClick={() => setWizardStep(0)}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="va-button-primary"
                      disabled={!draft.name || !draft.date || !draft.location}
                      onClick={() => setWizardStep(2)}
                    >
                      <FaArrowRight />
                      <span>Next: note</span>
                    </button>
                  </div>
                </>
              )}

              {wizardStep === 2 && (
                <>
                  <label className="va-field">
                    <span>Stuff note</span>
                    <textarea
                      rows={6}
                      value={draft.travelNote}
                      onChange={(event) => setDraft((current) => ({ ...current, travelNote: event.target.value }))}
                      placeholder="What's the story with this object?"
                    />
                  </label>

                  <div className="va-form-actions">
                    <button type="button" className="va-button-secondary" onClick={() => setWizardStep(1)}>
                      Back
                    </button>
                    <button type="submit" className="va-button-primary" disabled={uploadPhase === 'uploading'}>
                      {uploadPhase === 'uploading' ? <FaSpinner className="va-spin" /> : <FaCloudUploadAlt />}
                      <span>{editMode ? 'Update record' : 'Upload to R2 & save'}</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          </article>

          <aside className="va-side-stack">
            <section className="va-side-panel va-reveal">
              <div className="va-panel-head">
                <div>
                  <div className="va-section-label">Passkey</div>
                  <h2 className="va-panel-title">Quick login</h2>
                </div>
                <FaCheckCircle className={passkeyStatus.hasPasskey ? 'va-passkey-ok' : 'va-passkey-off'} />
              </div>

              <p className="va-side-copy">
                {passkeyStatus.hasPasskey
                  ? 'This account can come back in a single platform prompt.'
                  : 'Sign out later, then use this to add a passkey for the next visit.'}
              </p>

              <div className="va-status-stack">
                <div>
                  <span>Account</span>
                  <strong>{session?.username || username || 'admin'}</strong>
                </div>
                <div>
                  <span>Passkeys</span>
                  <strong>{passkeyStatus.credentialCount || 0}</strong>
                </div>
                <div>
                  <span>Mode</span>
                  <strong>{session?.mode || 'password'}</strong>
                </div>
              </div>

              <button
                type="button"
                className="va-button-primary full"
                onClick={handleRegisterPasskey}
                disabled={passkeyBusy}
              >
                {passkeyBusy ? <FaSpinner className="va-spin" /> : <FaKey />}
                <span>{passkeyStatus.hasPasskey ? 'Refresh passkey' : 'Register passkey'}</span>
              </button>
            </section>

            <section className="va-side-panel va-reveal">
              <div className="va-panel-head">
                <div>
                  <div className="va-section-label">State</div>
                  <h2 className="va-panel-title">Workspace notes</h2>
                </div>
                <span className="va-panel-tag">{notice || 'Calm and editable'}</span>
              </div>

              <p className="va-side-copy">
                Use the editor to adjust an existing record or add a new one. Nothing is published until you sync.
              </p>

              <div className="va-status-stack">
                <div>
                  <span>Visible records</span>
                  <strong>{collections.length}</strong>
                </div>
                <div>
                  <span>Models</span>
                  <strong>{availableModels.length}</strong>
                </div>
                <div>
                  <span>Browser support</span>
                  <strong>{passkeySupported ? 'WebAuthn' : 'No WebAuthn'}</strong>
                </div>
              </div>

              <button
                type="button"
                className="va-button-secondary full"
                onClick={syncCollectionsToCloud}
                disabled={isSyncing}
              >
                {isSyncing ? <FaSpinner className="va-spin" /> : <FaCloudUploadAlt />}
                <span>{isSyncing ? 'Publishing…' : 'Sync manifest'}</span>
              </button>
            </section>

            <section className="va-side-panel va-side-list va-reveal">
              <div className="va-panel-head">
                <div>
                  <div className="va-section-label">Inventory</div>
                  <h2 className="va-panel-title">Collection rows</h2>
                </div>
                <span className="va-panel-tag">{String(collections.length).padStart(2, '0')}</span>
              </div>

              <div className="va-list">
                {collections.map((item, index) => (
                  <article key={item.id || index} className="va-row-card">
                    <div className="va-row-frame">
                      {item.thumbnail ? (
                        // Static image, not a live Canvas — the inventory list can hold
                        // many rows, and each Canvas is its own WebGL context. Rendering
                        // one live 3D preview per row exhausts the browser's context limit
                        // (that's what broke "choose model file" earlier). Live preview is
                        // reserved for the single record actually being edited, above.
                        <img src={item.thumbnail} alt={item.name} className="va-row-thumb" loading="lazy" />
                      ) : (
                        <div className="va-preview-placeholder small">
                          <div className="va-preview-glyph" />
                        </div>
                      )}
                    </div>

                    <div className="va-row-content">
                      <div className="va-row-num">
                        {String(index + 1).padStart(2, '0')} / {String(collections.length).padStart(2, '0')}
                      </div>
                      <h3>{item.name}</h3>
                      <div className="va-row-meta">
                        <span>{item.location}</span>
                        <span>{item.date}</span>
                      </div>
                      <p>{formatSnippet(item.travelNote)}</p>
                      <div className="va-row-actions">
                        <button type="button" className="va-mini-button" onClick={() => handleEdit(item)}>
                          <FaPen />
                          <span>Edit</span>
                        </button>
                        <button type="button" className="va-mini-button danger" onClick={() => handleDelete(item.id)}>
                          <FaTrash />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </section>

        {notice && (
          <div className="va-toast va-reveal">
            <FaCheckCircle />
            <span>{notice}</span>
          </div>
        )}
      </main>

      <style jsx global>{adminStyles}</style>
    </div>
  );
}

const adminStyles = `
  * , *::before, *::after { box-sizing: border-box; }

  html {
    scroll-behavior: smooth;
    background: #f7f6f2;
  }

  body {
    margin: 0;
    background: #f7f6f2;
    color: #111111;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .va-admin-page {
    min-height: 100vh;
    position: relative;
    background: linear-gradient(180deg, #f7f6f2 0%, #f4f3ee 100%);
  }

  .va-admin-page::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(rgba(17, 17, 17, 0.02) 1px, transparent 1px);
    background-size: 18px 18px;
    opacity: 0.4;
    mix-blend-mode: multiply;
  }

  .va-admin-shell {
    position: relative;
    z-index: 1;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 32px 40px;
  }

  .va-admin-topbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 32px;
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
  .va-kicker,
  .va-section-label,
  .va-panel-meta,
  .va-panel-tag,
  .va-panel-foot,
  .va-input-note,
  .va-row-num,
  .va-row-meta,
  .va-status-stack span,
  .va-summary-chip span,
  .va-toast {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10px;
    font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
  }

  .va-brand-sub {
    margin-top: 8px;
    color: rgba(17, 17, 17, 0.48);
  }

  .va-topbar-note {
    color: rgba(17, 17, 17, 0.46);
    white-space: nowrap;
    padding-top: 4px;
  }

  .va-topbar-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .va-admin-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
    gap: 34px;
    align-items: stretch;
    padding-bottom: 28px;
  }

  .va-admin-copy {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 62vh;
    padding: 10px 0 12px;
  }

  .va-admin-title {
    margin: 0;
    max-width: 11ch;
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    font-size: clamp(54px, 6.6vw, 108px);
    line-height: 0.94;
    letter-spacing: -0.05em;
    font-weight: 400;
    text-wrap: balance;
  }

  .va-admin-body {
    margin: 22px 0 0;
    max-width: 42ch;
    color: rgba(17, 17, 17, 0.66);
    line-height: 1.9;
  }

  .va-admin-chips {
    margin-top: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    color: rgba(17, 17, 17, 0.46);
  }

  .va-admin-chips span {
    padding-right: 14px;
    border-right: 1px solid rgba(17, 17, 17, 0.12);
  }

  .va-admin-chips span:last-child {
    padding-right: 0;
    border-right: 0;
  }

  .va-admin-panel,
  .va-editor-panel,
  .va-side-panel,
  .va-summary-chip,
  .va-row-card {
    background: rgba(255, 255, 255, 0.62);
    border: 1px solid rgba(17, 17, 17, 0.08);
    box-shadow: 0 14px 42px rgba(17, 17, 17, 0.05);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .va-admin-panel {
    padding: 28px;
  }

  .va-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .va-panel-title {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    font-size: clamp(24px, 2.4vw, 38px);
    line-height: 1;
    letter-spacing: -0.04em;
    font-weight: 400;
  }

  .va-panel-meta {
    display: flex;
    gap: 12px;
    color: rgba(17, 17, 17, 0.46);
    white-space: nowrap;
  }

  .va-field {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 18px;
    position: relative;
  }

  .va-field span,
  .va-upload-shell > span,
  .va-slider > span {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10px;
    color: rgba(17, 17, 17, 0.46);
    font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
  }

  .va-field input,
  .va-field textarea,
  .va-field select {
    width: 100%;
    border: 0;
    outline: none;
    background: rgba(255, 255, 255, 0.72);
    border-bottom: 1px solid rgba(17, 17, 17, 0.12);
    padding: 14px 0 12px;
    color: #111111;
    font: inherit;
    font-size: 15px;
  }

  .va-field input::placeholder,
  .va-field textarea::placeholder {
    color: rgba(17, 17, 17, 0.3);
  }

  .va-field textarea {
    resize: vertical;
    min-height: 96px;
  }

  .va-field input:focus,
  .va-field textarea:focus,
  .va-field select:focus {
    border-bottom-color: rgba(17, 17, 17, 0.38);
  }

  .va-grid-two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 20px;
    align-items: start;
  }

  .va-field-wide {
    grid-column: 1 / -1;
  }

  .va-search-popover {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 20;
    background: #f7f6f2;
    border: 1px solid rgba(17, 17, 17, 0.08);
    box-shadow: 0 18px 50px rgba(17, 17, 17, 0.08);
    max-height: 240px;
    overflow: auto;
  }

  .va-search-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 0;
    border-bottom: 1px solid rgba(17, 17, 17, 0.06);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .va-search-item:hover {
    background: rgba(17, 17, 17, 0.03);
  }

  .va-search-item span {
    font-size: 13px;
    text-transform: none;
    letter-spacing: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .va-search-item small {
    color: rgba(17, 17, 17, 0.42);
  }

  .va-input-note {
    margin-top: 8px;
    color: rgba(17, 17, 17, 0.42);
  }

  .va-upload-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .va-upload-button,
  .va-button-primary,
  .va-button-secondary,
  .va-mini-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(17, 17, 17, 0.12);
    min-height: 44px;
    padding: 0 16px;
    cursor: pointer;
    transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
  }

  .va-button-primary,
  .va-upload-button {
    background: #111111;
    color: #f7f6f2;
  }

  .va-button-secondary,
  .va-mini-button {
    background: rgba(255, 255, 255, 0.68);
    color: #111111;
  }

  .va-button-primary:hover,
  .va-button-secondary:hover,
  .va-upload-button:hover,
  .va-mini-button:hover {
    transform: translateY(-1px);
    border-color: rgba(17, 17, 17, 0.28);
  }

  .va-button-primary:disabled,
  .va-button-secondary:disabled {
    opacity: 0.56;
    cursor: not-allowed;
    transform: none;
  }

  .va-button-primary.full,
  .va-button-secondary.full {
    width: 100%;
    justify-content: flex-start;
  }

  .va-hidden-file {
    display: none;
  }

  .va-slider-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin: 4px 0 18px;
  }

  .va-slider {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .va-slider strong {
    font-size: 13px;
    font-weight: 500;
    color: rgba(17, 17, 17, 0.68);
  }

  .va-slider input[type='range'] {
    width: 100%;
    accent-color: #111111;
  }

  .va-form-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .va-model-reveal {
    /* height/opacity are driven by GSAP once a model is chosen (see the
       reveal effect) — this is just the resting/no-JS/reduced-motion state. */
    margin-bottom: 18px;
  }

  .va-preview-stage {
    /* Fixed, not user-resizable — the native CSS resize handle turned out
       to size .va-preview-stage and .va-preview-frame independently in
       Safari (that's what broke the controls layer's position). Fits the
       parent column's full width instead of a small capped box floating
       with a big empty gutter beside it. .va-preview-frame and
       .va-preview-controls both fill 100% of this, so they can never
       drift apart. */
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    margin: 0 0 18px;
  }

  .va-preview-frame {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(17, 17, 17, 0.08);
    background: #f1efe8;
  }

  /* Controls layer: sits on top of .va-preview-frame but is a separate
     container from it, not a child — see the comment at the call site.
     pointer-events:none on the layer itself so it doesn't block the resize
     handle or anything else in .va-preview-frame; individual controls opt
     back in. */
  .va-preview-controls {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    pointer-events: none;
  }

  .va-preview-controls > * {
    pointer-events: auto;
  }

  .va-origin-reset {
    position: absolute;
    top: 8px;
    right: 8px;
    background: transparent;
    border: 0;
    padding: 4px 2px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10px;
    color: rgba(17, 17, 17, 0.46);
    font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
    transition: color 180ms ease;
  }

  .va-origin-reset:hover {
    color: rgba(17, 17, 17, 0.85);
  }

  .va-preview-placeholder,
  .va-preview-loading {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background: #f1efe8;
    color: rgba(17, 17, 17, 0.42);
  }

  .va-preview-placeholder.small {
    min-height: 96px;
  }

  .va-preview-glyph {
    width: 54px;
    height: 54px;
    border: 1px solid rgba(17, 17, 17, 0.2);
  }

  .va-lock-screen {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: grid;
    place-items: center;
    background: rgba(17, 17, 17, 0.32);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 24px;
  }

  .va-lock-card {
    width: min(380px, 100%);
    background: #f7f6f2;
    border: 1px solid rgba(17, 17, 17, 0.1);
    box-shadow: 0 24px 80px rgba(17, 17, 17, 0.28);
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
  }

  .va-lock-icon {
    font-size: 26px;
    color: rgba(17, 17, 17, 0.6);
    margin-bottom: 6px;
  }

  .va-lock-icon-ok {
    color: #2e7d4f;
  }

  .va-lock-icon-err {
    color: #b3432b;
  }

  .va-lock-title {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    font-size: 20px;
  }

  .va-lock-body {
    margin: 0;
    color: rgba(17, 17, 17, 0.6);
    font-size: 13px;
    line-height: 1.6;
  }

  .va-lock-reassure {
    color: rgba(17, 17, 17, 0.42);
  }

  .va-wizard-steps {
    display: flex;
    gap: 8px;
    margin: 18px 0 4px;
  }

  .va-wizard-step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid rgba(17, 17, 17, 0.1);
    color: rgba(17, 17, 17, 0.4);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .va-wizard-step span:first-child {
    font-family: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
  }

  .va-wizard-step.is-active {
    border-color: rgba(17, 17, 17, 0.4);
    color: #111111;
    background: rgba(255, 255, 255, 0.6);
  }

  .va-wizard-step.is-done {
    color: rgba(17, 17, 17, 0.6);
  }

  .va-origin-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }


  .va-field-compact input {
    min-height: 40px;
  }

  .va-row-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .va-summary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }

  .va-summary-chip {
    padding: 18px 16px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .va-summary-chip span {
    color: rgba(17, 17, 17, 0.46);
  }

  .va-summary-chip strong {
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    font-size: 26px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .va-admin-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
    gap: 18px;
  }

  .va-editor-panel {
    padding: 28px;
  }

  .va-side-stack {
    display: grid;
    gap: 18px;
  }

  .va-side-panel {
    padding: 24px;
  }

  .va-side-copy {
    margin: 0 0 18px;
    color: rgba(17, 17, 17, 0.68);
    line-height: 1.8;
    max-width: 42ch;
  }

  .va-status-stack {
    display: grid;
    gap: 12px;
    margin-bottom: 18px;
  }

  .va-status-stack > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(17, 17, 17, 0.08);
  }

  .va-status-stack span {
    color: rgba(17, 17, 17, 0.46);
  }

  .va-status-stack strong {
    font-size: 15px;
    font-weight: 500;
  }

  .va-passkey-ok {
    color: #111111;
  }

  .va-passkey-off {
    color: rgba(17, 17, 17, 0.3);
  }

  .va-panel-tag {
    color: rgba(17, 17, 17, 0.46);
  }

  .va-side-list .va-list {
    display: grid;
    gap: 16px;
    max-height: 980px;
    overflow: auto;
    padding-right: 4px;
  }

  .va-row-card {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 16px;
    padding: 12px;
  }

  .va-row-frame {
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid rgba(17, 17, 17, 0.08);
    background: #f1efe8;
    overflow: hidden;
  }

  .va-row-content {
    min-width: 0;
  }

  .va-row-content h3 {
    margin: 2px 0 0;
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
    font-size: 24px;
    line-height: 1;
    letter-spacing: -0.04em;
    font-weight: 400;
  }

  .va-row-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    color: rgba(17, 17, 17, 0.46);
    margin-top: 10px;
  }

  .va-row-meta span {
    padding-right: 12px;
    border-right: 1px solid rgba(17, 17, 17, 0.12);
  }

  .va-row-meta span:last-child {
    padding-right: 0;
    border-right: 0;
  }

  .va-row-content p {
    margin: 12px 0 0;
    color: rgba(17, 17, 17, 0.7);
    line-height: 1.75;
  }

  .va-row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .va-mini-button {
    min-height: 38px;
    padding: 0 12px;
    font-size: 12px;
  }

  .va-mini-button.danger {
    color: rgba(17, 17, 17, 0.68);
  }

  .va-toast {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    background: rgba(247, 246, 242, 0.9);
    border: 1px solid rgba(17, 17, 17, 0.1);
    box-shadow: 0 16px 42px rgba(17, 17, 17, 0.08);
    padding: 12px 14px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: rgba(17, 17, 17, 0.6);
    z-index: 20;
  }

  .va-spin {
    animation: va-spin 0.9s linear infinite;
  }

  .va-loading {
    min-height: 100vh;
    display: grid;
    place-content: center;
    gap: 16px;
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

  .va-loading-line {
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

  @keyframes va-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }

    .va-reveal,
    .va-loading-line::after,
    .va-spin,
    .va-button-primary,
    .va-button-secondary,
    .va-upload-button,
    .va-mini-button {
      transition: none;
      animation: none;
    }
  }

  @media (max-width: 1100px) {
    .va-admin-hero,
    .va-admin-grid {
      grid-template-columns: 1fr;
    }

    .va-admin-copy {
      min-height: 0;
    }

    .va-summary-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .va-admin-shell {
      padding-left: 20px;
      padding-right: 20px;
    }

    .va-admin-topbar {
      flex-direction: column;
      align-items: flex-start;
    }

    .va-topbar-actions {
      width: 100%;
    }

    .va-button-primary,
    .va-button-secondary {
      width: 100%;
    }

    .va-admin-hero {
      gap: 22px;
    }

    .va-admin-panel,
    .va-editor-panel,
    .va-side-panel {
      padding: 20px;
    }

    .va-grid-two,
    .va-slider-grid {
      grid-template-columns: 1fr;
    }

    .va-summary-strip {
      grid-template-columns: 1fr;
    }

    .va-row-card {
      grid-template-columns: 88px minmax(0, 1fr);
    }

    .va-row-content h3 {
      font-size: 21px;
    }
  }
`;

export async function getServerSideProps() {
  return { props: { adminEnabled: ADMIN_ENABLED } };
}

export default function Admin({ adminEnabled }) {
  if (!adminEnabled) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#3a352d',
          background: '#f4efe8',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <p>Admin is temporarily disabled.</p>
      </main>
    );
  }

  return <AdminPanel />;
}
