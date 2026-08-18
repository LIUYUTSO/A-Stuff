import {
  ADMIN_ENABLED,
  ADMIN_USERNAME,
  AUTH_CHALLENGE_COOKIE_NAME,
  REG_CHALLENGE_COOKIE_NAME,
  buildRegistrationOptions,
  clearCookie,
  getSessionFromRequest,
  setCookie,
} from '../../../utils/auth';

export default async function handler(req, res) {
  if (!ADMIN_ENABLED) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const username = session.username || ADMIN_USERNAME;
  const optionsJSON = await buildRegistrationOptions(req, username);

  setCookie(res, REG_CHALLENGE_COOKIE_NAME, optionsJSON.challenge, {
    maxAge: 600,
    sameSite: 'Lax',
  });
  clearCookie(res, AUTH_CHALLENGE_COOKIE_NAME);

  return res.status(200).json({
    username,
    optionsJSON,
  });
}
