import { isAuthorized } from '../../utils/auth';
import { makeS3Client, publicUrlFor, getIO, MeshoptSimplifier } from '../../utils/r2';
import { simplify } from '@gltf-transform/functions';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'buffer';
import { PNG } from 'pngjs';

// Only a key + a screenshot-sized PNG pass through here now (the model
// itself was already PUT straight to R2), but keep this comfortably under
// Vercel's real 4.5MB function-payload ceiling so an oversized thumbnail
// fails with a clear message instead of the platform's opaque 413.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function placeholderThumbnail() {
  const width = 400;
  const height = 300;
  const png = new PNG({ width, height });
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
  return PNG.sync.write(png);
}

// Step 2 of the upload flow, called once the browser has PUT the raw model
// straight to R2 (see r2-upload-url.js). This only ever handles small JSON —
// the actual model bytes are fetched back from R2 with an outbound GetObject
// call, which isn't subject to Vercel's 4.5MB function-payload limit (that
// limit is specifically about the HTTP request/response of the function
// itself, not calls the function makes to other services).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { key, thumbnail } = req.body || {};
    if (!key || !key.startsWith('models/high/')) {
      return res.status(400).json({ error: 'Missing or invalid key' });
    }

    const s3 = makeS3Client();
    const bucket = process.env.R2_BUCKET;
    const filename = key.slice('models/high/'.length);

    const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const highBuffer = await streamToBuffer(getRes.Body);

    // generate low-poly using gltf-transform
    let lowBuffer;
    try {
      const io = await getIO();
      const doc = await io.readBinary(highBuffer);
      await doc.transform(simplify({
        simplifier: MeshoptSimplifier,
        // target ratio; adjust if you want more/less simplification
        ratio: 0.25,
      }));
      lowBuffer = Buffer.from(await io.writeBinary(doc));
    } catch (err) {
      console.error('Low-poly generation failed, falling back to original for lowBuffer:', err.message);
      lowBuffer = highBuffer; // fallback to original if simplification fails
    }

    // Thumbnail: the browser sends a canvas.toDataURL() capture of the model
    // as it was actually being previewed (brightness/origin/camera tuned).
    // No server-side re-render — see r2-upload.js history for why that never
    // worked reliably (no GPU in most server/serverless environments).
    let thumbBuffer;
    if (thumbnail) {
      try {
        thumbBuffer = Buffer.from(thumbnail, 'base64');
      } catch (err) {
        console.warn('Could not decode client-supplied thumbnail, falling back to placeholder:', err.message);
      }
    }
    if (!thumbBuffer) thumbBuffer = placeholderThumbnail();

    const lowKey = `models/low/${filename}`;
    const baseName = filename.replace(/\.[^.]+$/, '');
    const thumbKey = `thumbnails/${baseName}.png`;

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: lowKey, Body: lowBuffer, ContentType: 'model/gltf-binary' }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: thumbBuffer, ContentType: 'image/png' }));

    const urls = {
      high: publicUrlFor(key),
      low: publicUrlFor(lowKey),
      thumbnail: publicUrlFor(thumbKey),
    };

    return res.status(200).json({ success: true, urls });
  } catch (error) {
    console.error('r2-process error:', error);
    return res.status(500).json({ error: error.message || 'Processing failed' });
  }
}
