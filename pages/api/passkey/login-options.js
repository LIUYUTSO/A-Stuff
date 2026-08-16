import {
  ADMIN_USERNAME,
  AUTH_CHALLENGE_COOKIE_NAME,
  buildAuthenticationOptions,
  getPasskeyStatus,
  normalizeUsername,
  setCookie,
} from '../../../utils/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.body || {};
  const loginUsername = normalizeUsername(username || ADMIN_USERNAME);
  const status = await getPasskeyStatus(loginUsername);

  if (!status.hasPasskey) {
    return res.status(404).json({ error: 'No passkey registered for this account' });
  }

  const optionsJSON = await buildAuthenticationOptions(req, loginUsername);

  setCookie(res, AUTH_CHALLENGE_COOKIE_NAME, optionsJSON.challenge, {
    maxAge: 600,
    sameSite: 'Lax',
  });

  return res.status(200).json({
    username: loginUsername,
    optionsJSON,
    passkey: status,
  });
}
