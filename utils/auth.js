import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

const PASSKEY_STORE_PATH = path.join(process.cwd(), 'data', 'passkeys.json');
const SESSION_COOKIE_NAME = 'auth_token';
const REG_CHALLENGE_COOKIE_NAME = 'astuff_reg_challenge';
const AUTH_CHALLENGE_COOKIE_NAME = 'astuff_auth_challenge';
const SESSION_TTL_SECONDS = Number(process.env.ADMIN_SESSION_TTL_SECONDS || 60 * 60 * 12);

// Admin login (password + passkey) is disabled by default. Set ADMIN_ENABLED=true
// in env to turn it back on for a given environment (dev or production).
const ADMIN_ENABLED = String(process.env.ADMIN_ENABLED || '').toLowerCase() === 'true';

const ADMIN_USERNAME = normalizeUsername(process.env.ADMIN_USERNAME || 'adam.liou');
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME || 'Adam Liu';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD || 'a-stuff-session-secret';

function normalizeUsername(username = '') {
  return String(username).trim().toLowerCase();
}

function getConfiguredAdmin() {
  return {
    username: ADMIN_USERNAME,
    displayName: ADMIN_DISPLAY_NAME,
  };
}

function getRequestHost(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host || 'localhost';
  return Array.isArray(host) ? host[0] : host;
}

function getRequestOrigin(req) {
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader) return originHeader;

  const host = getRequestHost(req);
  const protocol = host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function getRpId(req) {
  return (process.env.WEBAUTHN_RP_ID || getRequestHost(req).split(':')[0]).trim();
}

function createUserId(username = ADMIN_USERNAME) {
  return crypto.createHash('sha256').update(normalizeUsername(username)).digest().subarray(0, 32);
}

function bufferToBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlToBuffer(value) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').reduce((acc, pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', `SameSite=${options.sameSite || 'Lax'}`];

  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure');

  return parts.join('; ');
}

function appendSetCookie(res, cookieHeader) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieHeader);
    return;
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieHeader]);
    return;
  }

  res.setHeader('Set-Cookie', [existing, cookieHeader]);
}

function setCookie(res, name, value, options = {}) {
  appendSetCookie(res, serializeCookie(name, value, options));
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

function sessionSecret() {
  return SESSION_SECRET;
}

function createSessionToken({ username, mode }) {
  const payload = {
    username: normalizeUsername(username),
    mode,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };

  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;

  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = crypto.createHmac('sha256', sessionSecret()).update(payloadPart).digest('base64url');
  const actual = Buffer.from(signaturePart);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!payload?.username || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE_NAME]);
}

function isAuthorized(req) {
  const session = getSessionFromRequest(req);
  if (session && normalizeUsername(session.username) === ADMIN_USERNAME) return true;

  const cookies = parseCookies(req);
  const legacyHash = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');
  return cookies[SESSION_COOKIE_NAME] === legacyHash;
}

async function readPasskeyStore() {
  try {
    const raw = await fs.readFile(PASSKEY_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.accounts || typeof parsed.accounts !== 'object') {
      parsed.accounts = {};
    }
    return parsed;
  } catch {
    return { accounts: {} };
  }
}

async function writePasskeyStore(store) {
  await fs.mkdir(path.dirname(PASSKEY_STORE_PATH), { recursive: true });
  await fs.writeFile(PASSKEY_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function getAccountRecord(store, username = ADMIN_USERNAME) {
  const key = normalizeUsername(username);
  if (!store.accounts[key]) {
    store.accounts[key] = {
      username: key,
      displayName: ADMIN_DISPLAY_NAME,
      credentials: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return store.accounts[key];
}

function getStoredCredentials(store, username = ADMIN_USERNAME) {
  return getAccountRecord(store, username).credentials || [];
}

function getCredentialRecord(store, username, credentialId) {
  const credentials = getStoredCredentials(store, username);
  return credentials.find((credential) => credential.id === credentialId) || null;
}

function serializeCredential(credential, metadata = {}) {
  return {
    id: credential.id,
    publicKey: bufferToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports || [],
    deviceType: metadata.credentialDeviceType || metadata.deviceType || 'multiDevice',
    backedUp: Boolean(metadata.credentialBackedUp),
    createdAt: metadata.createdAt || new Date().toISOString(),
    updatedAt: metadata.updatedAt || new Date().toISOString(),
  };
}

function deserializeCredential(record) {
  if (!record) return null;
  return {
    id: record.id,
    publicKey: base64UrlToBuffer(record.publicKey),
    counter: record.counter || 0,
    transports: record.transports || [],
  };
}

async function upsertCredential(username, credentialRecord) {
  const store = await readPasskeyStore();
  const account = getAccountRecord(store, username);
  const now = new Date().toISOString();
  const index = account.credentials.findIndex((entry) => entry.id === credentialRecord.id);

  const nextRecord = {
    ...credentialRecord,
    updatedAt: now,
  };

  if (index >= 0) {
    account.credentials[index] = {
      ...account.credentials[index],
      ...nextRecord,
    };
  } else {
    account.credentials.push({
      ...nextRecord,
      createdAt: now,
    });
  }

  account.updatedAt = now;
  await writePasskeyStore(store);
  return account;
}

async function updateCredentialCounter(username, credentialId, counter) {
  const store = await readPasskeyStore();
  const account = getAccountRecord(store, username);
  const credential = account.credentials.find((entry) => entry.id === credentialId);
  if (!credential) return null;

  credential.counter = counter;
  credential.updatedAt = new Date().toISOString();
  account.updatedAt = credential.updatedAt;
  await writePasskeyStore(store);
  return credential;
}

async function getPasskeyStatus(username = ADMIN_USERNAME) {
  const store = await readPasskeyStore();
  const account = store.accounts[normalizeUsername(username)];
  return {
    username: normalizeUsername(username),
    displayName: account?.displayName || ADMIN_DISPLAY_NAME,
    credentialCount: account?.credentials?.length || 0,
    hasPasskey: Boolean(account?.credentials?.length),
    latestCredentialAt: account?.updatedAt || null,
  };
}

function getRegistrationOptionsInput(req, username = ADMIN_USERNAME) {
  return {
    rpName: 'A-Stuff',
    rpID: getRpId(req),
    userName: normalizeUsername(username),
    userID: createUserId(username),
    userDisplayName: ADMIN_DISPLAY_NAME,
    timeout: 60000,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  };
}

async function buildRegistrationOptions(req, username = ADMIN_USERNAME) {
  const store = await readPasskeyStore();
  const credentials = getStoredCredentials(store, username).map(({ id, transports }) => ({
    id,
    transports,
  }));

  return generateRegistrationOptions({
    ...getRegistrationOptionsInput(req, username),
    excludeCredentials: credentials,
  });
}

async function buildAuthenticationOptions(req, username = ADMIN_USERNAME) {
  const store = await readPasskeyStore();
  const credentials = getStoredCredentials(store, username);

  return generateAuthenticationOptions({
    rpID: getRpId(req),
    allowCredentials: credentials.map(({ id, transports }) => ({
      id,
      transports,
    })),
    timeout: 60000,
    userVerification: 'preferred',
  });
}

function getAuthContext(req) {
  const cookies = parseCookies(req);
  const session = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
  return {
    cookies,
    session,
    username: session?.username || ADMIN_USERNAME,
    origin: getRequestOrigin(req),
    rpID: getRpId(req),
  };
}

async function verifyRegistrationForUser({ req, username, response, expectedChallenge }) {
  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getRequestOrigin(req),
    expectedRPID: getRpId(req),
  });

  if (!verified.verified) return verified;

  const credential = verified.registrationInfo.credential;
  const record = serializeCredential(credential, verified.registrationInfo);
  const account = await upsertCredential(username, record);

  return {
    ...verified,
    account,
  };
}

async function verifyAuthenticationForUser({ req, username, response, expectedChallenge }) {
  const store = await readPasskeyStore();
  const account = getAccountRecord(store, username);
  const credential = account.credentials.find((entry) => entry.id === response.id);

  if (!credential) {
    return { verified: false };
  }

  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getRequestOrigin(req),
    expectedRPID: getRpId(req),
    credential: deserializeCredential(credential),
  });

  if (!verified.verified) return verified;

  await updateCredentialCounter(username, credential.id, verified.authenticationInfo.newCounter);

  return verified;
}

export {
  ADMIN_DISPLAY_NAME,
  ADMIN_ENABLED,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  AUTH_CHALLENGE_COOKIE_NAME,
  REG_CHALLENGE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  appendSetCookie,
  buildAuthenticationOptions,
  buildRegistrationOptions,
  bufferToBase64Url,
  clearCookie,
  createSessionToken,
  createUserId,
  deserializeCredential,
  getAccountRecord,
  getAuthContext,
  getConfiguredAdmin,
  getCredentialRecord,
  getPasskeyStatus,
  getRequestOrigin,
  getRpId,
  getSessionFromRequest,
  getStoredCredentials,
  isAuthorized,
  normalizeUsername,
  parseCookies,
  readPasskeyStore,
  setCookie,
  updateCredentialCounter,
  upsertCredential,
  verifyAuthenticationForUser,
  verifyRegistrationForUser,
  verifySessionToken,
};
