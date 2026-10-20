import type { NextApiRequest, NextApiResponse } from 'next';
import { adminConfig, isAdmin } from '../../../lib/admin-auth';

// Is this browser logged in as admin? (The cookie is HttpOnly, so the page has to ask.)
export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ configured: !!adminConfig(), admin: isAdmin(req) });
}
