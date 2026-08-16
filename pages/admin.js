import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import {
  FaArrowRight,
  FaCheckCircle,
  FaCloudUploadAlt,
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

const initialDraft = {
  name: '',
  description: '',
  location: '',
  date: '',
  modelPath: '',
  scale: 1,
  intensity: 1.5,
  rotationY: 0,
  autoRotateSpeed: 2,
  coordinates: [35.6762, 139.6503],
  travelNote: '',
};

function normalizeDraft(item) {
  return {
    ...initialDraft,
    ...item,
    coordinates: Array.isArray(item?.coordinates) ? item.coordinates : initialDraft.coordinates,
    scale: Number(item?.scale ?? 1),
    intensity: Number(item?.intensity ?? 1.5),
    rotationY: Number(item?.rotationY ?? 0),
    autoRotateSpeed: Number(item?.autoRotateSpeed ?? 2),
  };
}

function formatSnippet(text) {
  if (!text) return 'No note.';
  return text.length > 96 ? `${text.slice(0, 95)}…` : text;
}

export default function Admin() {
  const uploadInputRef = useRef(null);

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

        setCollections(locationInfo || []);

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

  useEffect(() => {
    if (authorized || !username) return undefined;

    const timer = setTimeout(() => {
      refreshPasskeyStatus(username);
    }, 250);

    return () => clearTimeout(timer);
  }, [authorized, refreshPasskeyStatus, username]);

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

  const clearDraft = useCallback(() => {
    setDraft(initialDraft);
    setEditMode(false);
    setEditId(null);
    setLocationSearch('');
    setSearchResults([]);
  }, []);

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();

      if (editMode) {
        setCollections((current) =>
          current.map((item) => (item.id === editId ? { ...draft, id: editId } : item))
        );
        setNotice('Record updated locally.');
      } else {
        setCollections((current) => [...current, { ...draft, id: Date.now() }]);
        setNotice('Record added locally.');
      }

      clearDraft();
    },
    [clearDraft, draft, editId, editMode]
  );

  const handleEdit = useCallback((item) => {
    setEditMode(true);
    setEditId(item.id);
    setDraft(normalizeDraft(item));
    setLocationSearch(item.location || '');
    setNotice(`Editing ${item.name}.`);
  }, []);

  const handleDelete = useCallback((itemId) => {
    if (!window.confirm('Delete this archive record?')) return;
    setCollections((current) => current.filter((item) => item.id !== itemId));
    setNotice('Record removed locally.');
  }, []);

  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setNotice(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
      return;
    }

    if (!window.confirm(`Upload ${file.name} to the cloud?`)) return;

    const readFileAsBase64 = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          const base64 = result.split(',')[1];
          if (!base64) {
            reject(new Error('Could not read file content.'));
            return;
          }
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    setIsSyncing(true);
    try {
      const base64Content = await readFileAsBase64();
      const pushRes = await fetch('/api/r2-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: base64Content,
          filename: file.name,
        }),
      });

      const data = await pushRes.json();
      if (!pushRes.ok) throw new Error(data.message || data.error || 'Upload failed');

      const urls = data.urls || {};
      const low = urls.low || `/models/${file.name}`;
      const high = urls.high || `/models/${file.name}`;
      const thumbnail = urls.thumbnail || '';

      setAvailableModels((current) => (current.includes(low) ? current : [...current, low]));
      setDraft((current) => ({ ...current, modelPath: low, highModelPath: high, thumbnail }));
      setNotice('Model uploaded.');
    } catch (error) {
      setNotice(error.message || 'Upload failed.');
    } finally {
      setIsSyncing(false);
      event.target.value = '';
    }
  }, []);

  const syncCollectionsToCloud = useCallback(async () => {
    if (!window.confirm('Publish the current archive manifest to GitHub?')) return;

    setIsSyncing(true);
    setNotice('');

    try {
      const res = await fetch('/api/r2-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collections),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      setNotice('Archive manifest synchronized.');
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
      <main className="va-admin-shell">
        <header className="va-admin-topbar">
          <div>
            <Link href="/" className="va-brand">
              Voyage Artifacts
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
              <div className="va-preview-frame">
                {draft.modelPath ? (
                  <ModelPreview
                    modelPath={draft.modelPath}
                    scale={1}
                    intensity={draft.intensity}
                    rotationY={draft.rotationY}
                    autoRotateSpeed={draft.autoRotateSpeed}
                    adjustCamera={1.8}
                    fov={50}
                  />
                ) : (
                  <div className="va-preview-placeholder">
                    <div className="va-preview-glyph" />
                    <span>Awaiting model</span>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="va-form">
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

                <label className="va-field">
                  <span>Model</span>
                  <select
                    value={draft.modelPath}
                    onChange={(event) => setDraft((current) => ({ ...current, modelPath: event.target.value }))}
                  >
                    <option value="">Choose from library</option>
                    {availableModels.map((model) => (
                      <option key={model} value={model}>
                        {model.replace('/models/', '')}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="va-upload-shell">
                  <span>Upload</span>
                  <button
                    type="button"
                    className="va-upload-button"
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    <FaCloudUploadAlt />
                    <span>Choose model file</span>
                  </button>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".glb,.gltf"
                    onChange={handleFileUpload}
                    className="va-hidden-file"
                  />
                </div>
              </div>

              <label className="va-field">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short public description"
                  required
                />
              </label>

              <label className="va-field">
                <span>Travel note</span>
                <textarea
                  rows={4}
                  value={draft.travelNote}
                  onChange={(event) => setDraft((current) => ({ ...current, travelNote: event.target.value }))}
                  placeholder="Field note"
                />
              </label>

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
              </div>

              <div className="va-form-actions">
                <button type="submit" className="va-button-primary">
                  <FaArrowRight />
                  <span>{editMode ? 'Update record' : 'Save record'}</span>
                </button>
                {editMode && (
                  <button type="button" className="va-button-secondary" onClick={clearDraft}>
                    Cancel
                  </button>
                )}
              </div>
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
                      {item.modelPath ? (
                        <ModelPreview
                          modelPath={item.modelPath}
                          scale={1}
                          intensity={item.intensity || 1.5}
                          rotationY={item.rotationY || 0}
                          autoRotateSpeed={item.autoRotateSpeed || 2}
                          adjustCamera={1.8}
                          fov={50}
                        />
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
                      <p>{formatSnippet(item.description || item.travelNote)}</p>
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

  .va-preview-frame {
    width: 176px;
    aspect-ratio: 1;
    border: 1px solid rgba(17, 17, 17, 0.08);
    background: #f1efe8;
    overflow: hidden;
    flex: 0 0 auto;
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
