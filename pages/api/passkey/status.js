import { ADMIN_ENABLED, ADMIN_USERNAME, getPasskeyStatus, normalizeUsername } from '../../../utils/auth';

export default async function handler(req, res) {
  if (!ADMIN_ENABLED) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const username = normalizeUsername(req.query.username || ADMIN_USERNAME);
  const status = await getPasskeyStatus(username);

  return res.status(200).json(status);
}
