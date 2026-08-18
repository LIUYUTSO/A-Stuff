// Next.js API route config to allow larger payloads (e.g., 3D models)
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

import { isAuthorized } from '../../utils/auth';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    if (!isAuthorized(req)) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { content, path, message, isBinary } = req.body;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'LIUYUTSO';
    const REPO_NAME = process.env.GITHUB_REPO_NAME || 'A-Stuff';

    if (!GITHUB_TOKEN) {
        return res.status(500).json({
            error: 'GitHub Token missing from environment',
            details: 'If this is on Vercel, please add GITHUB_TOKEN to Project Settings -> Environment Variables. Local .env.local is NOT shared with the cloud.'
        });
    }

    try {
        // GitHub API prefers path segments to be encoded individually, NOT the slashes.
        const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
        console.log('Syncing path:', encodedPath);

        // 1. Get the current file SHA (if it exists) to allow updating
        let sha;
        try {
            const getFileRes = await fetch(
                `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}`,
                {
                    headers: {
                        Authorization: `Bearer ${GITHUB_TOKEN}`,
                        Accept: 'application/vnd.github.v3+json',
                    },
                }
            );
            if (getFileRes.ok) {
                const fileData = await getFileRes.json();
                sha = fileData.sha;
            }
        } catch (err) {
            console.log('File does not exist yet, creating new one.');
        }

        // 2. Prepare content (handle binary for .glb files)
        let bodyContent = content;
        if (isBinary) {
            // Binary content should already be base64 from the client
            bodyContent = content;
        } else {
            bodyContent = Buffer.from(content).toString('base64');
        }

        // 3. Push to GitHub
        const pushRes = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message || 'CMS Update: Automatic push from A-Stuff artifacts',
                    content: bodyContent,
                    sha: sha, // Include SHA if updating
                    branch: 'main',
                }),
            }
        );

        const result = await pushRes.json();

        if (!pushRes.ok) {
            let errorMsg = result.message || 'GitHub Sync failed';
            if (pushRes.status === 401) errorMsg = 'Invalid GitHub Token (401). Check permissions.';
            if (pushRes.status === 403) errorMsg = 'Token permissions restricted (403). Ensure "repo" scope is enabled.';
            if (pushRes.status === 404) errorMsg = 'Repository or file path not found (404).';

            return res.status(pushRes.status).json({
                error: errorMsg,
                github_status: pushRes.status,
                github_message: result.message
            });
        }

        return res.status(200).json({
            message: 'Cloud Sync Successful',
            url: result.content.html_url
        });

    } catch (error) {
        console.error('GitHub Sync Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
