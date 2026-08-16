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
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) {
    throw new Error('R2_PUBLIC_BASE_URL is not set; connect a custom domain to the R2 bucket and set it in env');
  }
  // key segments are already URL-safe (filenames), but keep each segment encoded
  // individually so the `/` path separators survive.
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/$/, '')}/${encodedKey}`;
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

    // Attempt to render a real thumbnail by launching headless Chromium and rendering the low-poly model
    let thumbBuffer;
    try {
      const puppeteer = await import('puppeteer');
      const base64Low = lowBuffer.toString('base64');

      const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>body{margin:0;background:transparent;overflow:hidden}#c{width:800px;height:600px;display:block}</style>
      </head>
      <body>
        <canvas id="c"></canvas>
        <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
        <script src="https://unpkg.com/three@0.160.0/examples/js/loaders/GLTFLoader.js"></script>
        <script>
          (async () => {
            try {
              const canvas = document.getElementById('c');
              const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, alpha: true, antialias: true });
              renderer.setSize(800, 600);
              const scene = new THREE.Scene();
              scene.background = new THREE.Color(0xf4efe8);

              const camera = new THREE.PerspectiveCamera(35, 800/600, 0.1, 1000);

              const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
              scene.add(hemi);
              const dir = new THREE.DirectionalLight(0xffffff, 0.9);
              dir.position.set(10, 10, 10);
              scene.add(dir);

              // construct a blob from the embedded base64
              const base64 = '${base64Low}';
              const byteCharacters = atob(base64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'model/gltf-binary' });
              const url = URL.createObjectURL(blob);

              const loader = new THREE.GLTFLoader();
              loader.load(url, (gltf) => {
                const model = gltf.scene || gltf.scenes[0];
                scene.add(model);

                // compute bounding box to frame the camera
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());

                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.6;

                camera.position.set(center.x, center.y + maxDim*0.2, center.z + cameraZ);
                camera.lookAt(center);

                // subtle rotation for nicer thumbnail
                model.rotation.y = 0.18;

                // render and mark complete
                renderer.render(scene, camera);
                window.renderComplete = true;
              }, undefined, (err) => {
                console.error('GLTF load error', err);
                window.renderComplete = true; // still finish to avoid hanging
              });

              // safety timeout in case loader hangs
              setTimeout(() => { window.renderComplete = true; }, 8000);
            } catch (e) {
              console.error('Render error', e);
              window.renderComplete = true;
            }
          })();
        </script>
      </body>
      </html>`;

      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 600 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      // wait for renderComplete flag
      await page.waitForFunction('window.renderComplete === true', { timeout: 15000 }).catch(() => {});

      const canvas = await page.$('#c');
      if (canvas) {
        const screenshot = await canvas.screenshot({ type: 'png' });
        thumbBuffer = screenshot;
      }
      await browser.close();
    } catch (err) {
      console.warn('Thumbnail render failed, falling back to placeholder:', err && err.message);
      // fallback to simple png
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
      thumbBuffer = PNG.sync.write(png);
    }

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
