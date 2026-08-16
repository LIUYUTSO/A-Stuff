import { isAuthorized } from '../../utils/auth';
import { NodeIO } from '@gltf-transform/core';
import { simplify } from '@gltf-transform/functions';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { PNG } from 'pngjs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

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

function publicUrlFor(key) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURIComponent(key)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { content, filename } = req.body || {};
    if (!content || !filename) return res.status(400).json({ error: 'Missing content or filename' });

    const highBuffer = Buffer.from(content, 'base64');

    // generate low-poly using gltf-transform
    const io = new NodeIO();
    let lowBuffer;
    try {
      const doc = io.readBinary(highBuffer);
      // apply simplify transform; options tuned to produce a visible reduction
      await doc.transform(simplify({
        // target ratio; adjust if you want more/less simplification
        ratio: 0.25,
      }));
      lowBuffer = io.writeBinary(doc);
    } catch (err) {
      console.error('Low-poly generation failed, falling back to original for lowBuffer:', err.message);
      lowBuffer = highBuffer; // fallback to original if simplification fails
    }

    // generate a simple PNG thumbnail as a placeholder (400x300 solid background)
    const width = 400;
    const height = 300;
    const png = new PNG({ width, height });
    // fill with a subtle color
    const bgR = 236;
    const bgG = 231;
    const bgB = 219;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = bgR;
        png.data[idx + 1] = bgG;
        png.data[idx + 2] = bgB;
        png.data[idx + 3] = 255;
      }
    }
    const thumbBuffer = PNG.sync.write(png);

    // upload to R2
    const s3 = makeS3Client();
    const bucket = process.env.R2_BUCKET;
    const highKey = `models/high/${filename}`;
    const lowKey = `models/low/${filename}`;
    const baseName = filename.replace(/\.[^.]+$/, '');
    const thumbKey = `thumbnails/${baseName}.png`;

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: highKey, Body: highBuffer, ContentType: 'model/gltf-binary' }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: lowKey, Body: lowBuffer, ContentType: 'model/gltf-binary' }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: thumbBuffer, ContentType: 'image/png' }));

    const urls = {
      high: publicUrlFor(highKey),
      low: publicUrlFor(lowKey),
      thumbnail: publicUrlFor(thumbKey),
    };

    return res.status(200).json({ success: true, urls });
  } catch (error) {
    console.error('r2-upload error:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
