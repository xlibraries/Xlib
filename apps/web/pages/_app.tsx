import 'tailwindcss/tailwind.css'
import '../styles/index.css'
import { Ubuntu } from "next/font/google"

// Downloaded at build time and served from our own domain (no request to Google Fonts)
const ubuntu = Ubuntu({ weight: ["300", "400", "500", "700"], subsets: ["latin"], display: "swap" })

function MyApp({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`body { font-family: ${ubuntu.style.fontFamily}; }`}</style>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
