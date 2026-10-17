/** @type {import('next').NextConfig} */
const config = { poweredByHeader: false };

// Static pages in public/ (drop/, privacy/): GitHub Pages serves /drop/ → index.html on its own;
// the dev server doesn't, so redirect there locally. Defined only in development
// because `next export` doesn't support redirects.
if (process.env.NODE_ENV === 'development') {
    config.redirects = async () => ['drop', 'privacy'].map(page => (
        { source: `/${page}`, destination: `/${page}/index.html`, permanent: false }
    ));
}

module.exports = config;
