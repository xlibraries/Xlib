import Ubuntu from "../components/ubuntu";
import { useEffect } from "react";
import ReactGA from 'react-ga4';
import Meta from "../components/SEO/Meta";

const TRACKING_ID = process.env.NEXT_PUBLIC_TRACKING_ID;

function App() {
  useEffect(() => {
    if (!TRACKING_ID) return;
    ReactGA.initialize(TRACKING_ID);
  }, [TRACKING_ID]);

  return (
    <>
      <Meta />
      <Ubuntu />
    </>
  )
}

export default App;
