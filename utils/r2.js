import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d';
import { S3Client } from '@aws-sdk/client-s3';

export function makeS3Client() {
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

export function publicUrlFor(key) {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) {
    throw new Error('R2_PUBLIC_BASE_URL is not set; connect a custom domain to the R2 bucket and set it in env');
  }
  // key segments are already URL-safe (filenames), but keep each segment encoded
  // individually so the `/` path separators survive.
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/$/, '')}/${encodedKey}`;
}

let ioPromise;
// NodeIO + its decoder modules are expensive to spin up (Draco/Meshopt WASM),
// so build it once per server process (per warm Lambda instance) and reuse
// it across requests instead of per-request.
export function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      await MeshoptSimplifier.ready;
      return new NodeIO()
        .registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
        });
    })();
  }
  return ioPromise;
}

export { MeshoptSimplifier };
