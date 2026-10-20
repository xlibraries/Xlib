import React from 'react';
import Head from 'next/head';

/** `noindex`: keep the page out of search engines (the /xlib admin page). */
export default function Meta({ noindex = false }: { noindex?: boolean }) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://xlibraries.com';
    const siteUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const canonicalUrl = `${siteUrl}/`;
    const pageTitle = "Aman Agrawal | Visual Computing, AR, and Systems Engineering";
    const description = "Portfolio of Aman Agrawal (xlibraries): Visual Computing, AR systems, real-time tracking, and cross-platform engineering projects.";
    const imageUrl = `${siteUrl}/images/logos/logo_1200.png`;

    const personJsonLd = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Aman Agrawal",
        alternateName: "xlibraries",
        url: canonicalUrl,
        jobTitle: "Research Engineer / Systems Developer",
        sameAs: [
            "https://github.com/xlibraries"
        ]
    };

    const websiteJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Aman Agrawal Portfolio",
        url: canonicalUrl,
        inLanguage: "en-IN"
    };

    return (
        <Head>
            <title>{pageTitle}</title>
            <meta charSet="utf-8" />
            <meta name="title" content={pageTitle} />
            <meta name="description" content={description} />
            <meta name="author" content="Aman Agrawal (xlibraries)" />
            <meta
                name="keywords"
                content="xlibraries portfolio, aman agrawal portfolio, ubuntu portfolio, nextjs portfolio, xlib"
            />
            <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
            {!noindex && <meta name="googlebot" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />}
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="theme-color" content="#E95420" />
            <link rel="canonical" href={canonicalUrl} />
            <link rel="icon" type="image/svg+xml" href="/themes/Yaru/status/cof_orange_hex.svg" />

            <meta itemProp="name" content={pageTitle} />
            <meta itemProp="description" content={description} />
            <meta itemProp="image" content={imageUrl} />

            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:site" content="@xlibraries" />
            <meta name="twitter:creator" content="@xlibraries" />
            <meta name="twitter:image" content={imageUrl} />

            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={imageUrl} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:site_name" content="Aman Agrawal Personal Portfolio" />
            <meta property="og:locale" content="en_IN" />
            <meta property="og:type" content="website" />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
            />

        </Head>
    );
}
