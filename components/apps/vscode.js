import React from 'react'

export default function VsCode() {
    return (
        <iframe
            src="https://github1s.com/xlibraries/xlibraries.github.io/blob/HEAD/components/ubuntu.js"
            frameBorder="0"
            title="VsCode"
            className="h-full w-full bg-ub-cool-grey"
            loading="lazy"
        ></iframe>
    )
}

export const displayVsCode = () => {
    return <VsCode />;
}
