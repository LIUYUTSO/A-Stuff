import {
  ADMIN_USERNAME,
  AUTH_CHALLENGE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  clearCookie,
  createSessionToken,
  normalizeUsername,
  parseCookies,
  setCookie,
  verifyAuthenticationForUser,
} from '../../../utils/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, response } = req.body || {};
  const loginUsername = normalizeUsername(username || ADMIN_USERNAME);

  if (!response) {
    return res.status(400).json({ error: 'Missing passkey response' });
  }

  const challenge = parseCookies(req)[AUTH_CHALLENGE_COOKIE_NAME];
  if (!challenge) {
    return res.status(400).json({ error: 'Missing authentication challenge' });
  }

  const verified = await verifyAuthenticationForUser({
    req,
    username: loginUsername,
    response,
    expectedChallenge: challenge,
  });

  clearCookie(res, AUTH_CHALLENGE_COOKIE_NAME);

  if (!verified.verified) {
    return res.status(401).json({ error: 'Passkey login failed' });
  }

  const token = createSessionToken({ username: loginUsername, mode: 'passkey' });
  setCookie(res, SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_TTL_SECONDS,
    sameSite: 'Lax',
  });

  return res.status(200).json({
    success: true,
    username: loginUsername,
    mode: 'passkey',
  });
}
