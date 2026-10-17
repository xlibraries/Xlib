/** @type {import('next').NextConfig} */
const config = { poweredByHeader: false };

// The hidden uploader is a static page in public/drop/. GitHub Pages serves /drop/ → index.html
// on its own; the dev server doesn't, so redirect there locally. Defined only in development
// because `next export` doesn't support redirects.
if (process.env.NODE_ENV === 'development') {
    config.redirects = async () => [{ source: '/drop', destination: '/drop/index.html', permanent: false }];
}

module.exports = config;
