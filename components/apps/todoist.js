import React from 'react'

export default function Todoist() {
    return (
        <iframe
            src="https://todoist.com/showProject?id=220474322"
            frameBorder="0"
            title="Todoist"
            className="h-full w-full"
            loading="lazy"
        ></iframe>
    )
}

export const displayTodoist = () => {
    return <Todoist />;
}
