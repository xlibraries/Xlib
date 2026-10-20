import Ubuntu from "../components/shell/ubuntu";
import { useEffect } from "react";
import { initAnalytics } from '../lib/analytics';
import Meta from "../components/seo/Meta";

const TRACKING_ID = process.env.NEXT_PUBLIC_TRACKING_ID;

function App() {
  useEffect(() => {
    if (TRACKING_ID) initAnalytics(TRACKING_ID);
  }, []);

  return (
    <>
      <Meta />
      <Ubuntu />
    </>
  )
}

export default App;
