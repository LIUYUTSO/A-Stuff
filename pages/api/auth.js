import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionToken,
  normalizeUsername,
  setCookie,
} from '../../utils/auth';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server misconfiguration: ADMIN_PASSWORD not set' });
  }

  const { username, password } = req.body || {};
  const loginUsername = normalizeUsername(username || ADMIN_USERNAME);

  if (loginUsername !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect credentials' });
  }

  const token = createSessionToken({ username: loginUsername, mode: 'password' });
  setCookie(res, SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_TTL_SECONDS,
    sameSite: 'Lax',
  });

  return res.status(200).json({
    success: true,
    username: loginUsername,
    mode: 'password',
  });
}
