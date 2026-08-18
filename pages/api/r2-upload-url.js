import crypto from 'crypto';
import { isAuthorized } from '../../utils/auth';
import { makeS3Client } from '../../utils/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Step 1 of the upload flow: hand the browser a short-lived signed URL so it
// can PUT the raw model file straight to R2. The file bytes never pass
// through this function — Vercel Functions cap request/response bodies at
// 4.5MB (platform-level, `bodyParser.sizeLimit` in next.config can't touch
// it), which is well under the size of a real high-poly .glb. Routing the
// upload directly to R2 sidesteps that limit entirely.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { filename, contentType } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'Missing filename' });

    const s3 = makeS3Client();
    const bucket = process.env.R2_BUCKET;

    // R2/S3 PutObject has no collision protection — same key silently
    // overwrites whatever was there, no error, no versioning. Two uploads
    // that happen to share a filename (re-tests, re-exports from the same
    // tool with default names, etc.) would otherwise clobber each other,
    // including a filename an already-published record still points to.
    // Prefix with a short random id so every upload gets its own key;
    // r2-process.js derives the low/thumbnail keys from this same key, so
    // uniqueness carries through automatically.
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const key = `models/high/${uniqueId}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'model/gltf-binary',
    });

    // 15 minutes — high-poly .glb files can be 60MB+, and slow connections
    // plus a couple of client-side retries (see admin.js) need real headroom.
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    return res.status(200).json({ uploadUrl, key });
  } catch (error) {
    console.error('r2-upload-url error:', error);
    return res.status(500).json({ error: error.message || 'Could not create upload URL' });
  }
}
