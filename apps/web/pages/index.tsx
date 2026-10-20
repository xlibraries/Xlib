import { useEffect } from "react";
import Ubuntu from "../components/shell/ubuntu";
import Meta from "../components/seo/Meta";
import { trackSiteVisit } from '../lib/analytics';

function App() {
  useEffect(() => { trackSiteVisit(); }, []);

  return (
    <>
      <Meta />
      <Ubuntu />
    </>
  )
}

export default App;
