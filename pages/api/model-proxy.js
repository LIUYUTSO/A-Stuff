// Same-origin proxy for external 3D model files.
//
// The models are hosted on a CDN (e.g. cdn.adamliu.uk) that does not return
// CORS headers. three.js / GLTFLoader fetches these binaries cross-origin for
// WebGL, so the browser blocks them with "Failed to fetch". Routing the request
// through this API endpoint makes the fetch same-origin, sidestepping CORS,
// and lets us attach the correct content-type and caching headers.

export const config = {
  api: {
    responseLimit: false,
  },
};

// Only allow proxying from trusted hosts to avoid an open proxy.
const ALLOWED_HOSTS = new Set(['cdn.adamliu.uk']);

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing "url" query parameter.' });
    return;
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL.' });
    return;
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    res.status(403).json({ error: 'Host not allowed.' });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      // Forward Range requests so large models can stream/resume.
      headers: req.headers.range ? { range: req.headers.range } : undefined,
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream responded ${upstream.status}` });
      return;
    }

    res.status(upstream.status);
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'model/gltf-binary'
    );

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await upstream.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[v0] model-proxy fetch failed:', err);
    res.status(502).json({ error: 'Failed to fetch upstream model.' });
  }
}
