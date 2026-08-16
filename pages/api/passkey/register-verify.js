import {
  ADMIN_ENABLED,
  REG_CHALLENGE_COOKIE_NAME,
  clearCookie,
  getPasskeyStatus,
  getSessionFromRequest,
  parseCookies,
  verifyRegistrationForUser,
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

  const { response } = req.body || {};
  if (!response) {
    return res.status(400).json({ error: 'Missing passkey response' });
  }

  const challenge = parseCookies(req)[REG_CHALLENGE_COOKIE_NAME];
  if (!challenge) {
    return res.status(400).json({ error: 'Missing registration challenge' });
  }

  const result = await verifyRegistrationForUser({
    req,
    username: session.username,
    response,
    expectedChallenge: challenge,
  });

  clearCookie(res, REG_CHALLENGE_COOKIE_NAME);

  if (!result.verified) {
    return res.status(400).json({ error: 'Passkey registration failed' });
  }

  const status = await getPasskeyStatus(session.username);
  return res.status(200).json({
    success: true,
    username: session.username,
    passkey: status,
  });
}
