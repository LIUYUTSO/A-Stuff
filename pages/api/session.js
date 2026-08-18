import {
  ADMIN_USERNAME,
  IS_DEV,
  SESSION_COOKIE_NAME,
  clearCookie,
  getSessionFromRequest,
} from '../../utils/auth';

export default function handler(req, res) {
  if (req.method === 'GET') {
    // Local dev skips login entirely (see isAuthorized in utils/auth.js) —
    // report an always-authorized synthetic session so the admin UI drops
    // straight into the dashboard instead of showing the login screen.
    if (IS_DEV) {
      return res.status(200).json({ authorized: true, username: ADMIN_USERNAME, mode: 'dev' });
    }

    const session = getSessionFromRequest(req);
    return res.status(200).json({
      authorized: Boolean(session),
      username: session?.username || null,
      mode: session?.mode || null,
    });
  }

  if (req.method === 'DELETE') {
    clearCookie(res, SESSION_COOKIE_NAME);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
