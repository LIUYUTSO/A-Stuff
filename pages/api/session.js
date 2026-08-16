import {
  SESSION_COOKIE_NAME,
  clearCookie,
  getSessionFromRequest,
} from '../../utils/auth';

export default function handler(req, res) {
  if (req.method === 'GET') {
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
