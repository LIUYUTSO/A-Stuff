import { isAuthorized } from '../../utils/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function makeS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 credentials or bucket missing; please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in env');
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const collections = req.body;
    if (!collections) return res.status(400).json({ error: 'Missing collections payload' });

    const s3 = makeS3Client();
    const bucket = process.env.R2_BUCKET;
    const key = 'data/collections.json';

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(collections, null, 2), ContentType: 'application/json' }));

    const accountId = process.env.R2_ACCOUNT_ID;
    const publicUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURIComponent(key)}`;

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('r2-sync error:', error);
    return res.status(500).json({ error: error.message || 'Sync failed' });
  }
}
