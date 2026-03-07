// @ts-nocheck
import React from 'react';
import Head from 'next/head';

export default function Meta() {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://xlibraries.github.io/Xlib';
    const pageTitle = "Aman Agrawal's Portfolio - Xlib";
    const description = "Aman Agrawal's (xlibraries) personal portfolio website with an Ubuntu-inspired UI, built using Next.js and Tailwind CSS.";
    const imageUrl = `${siteUrl}/images/logos/logo_1200.png`;

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
            <meta name="robots" content="index, follow" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="theme-color" content="#E95420" />
            <link rel="canonical" href={siteUrl} />

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
            <meta property="og:url" content={siteUrl} />
            <meta property="og:site_name" content="Aman Agrawal Personal Portfolio" />
            <meta property="og:locale" content="en_IN" />
            <meta property="og:type" content="website" />

            <link
                rel="preload"
                href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap"
                as="style"
            />
            <link href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap" rel="stylesheet" />
        </Head>
    );
}
