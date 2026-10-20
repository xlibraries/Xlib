import Ubuntu from "../components/shell/ubuntu";
import Meta from "../components/seo/Meta";

// The admin desktop: same site, locked until the admin passcode is entered (see docs/admin-plan.md)
export default function Admin() {
  return (
    <>
      <Meta noindex />
      <Ubuntu admin />
    </>
  );
}
