import { getSessionUser } from "@/lib/auth/get-session-user";
import { resolveCheckoutDiscountForUser } from "@/lib/premiere-gal-discount";
import { PageSetsProvider } from "./page-sets-context";
import PremiereGalApp from "./premiere-gal-app";

/** Port of `resources/views/premieregal/main.blade.php` + `App.jsx`. */
export default async function PremiereGalPage() {
  const sessionUser = await getSessionUser();
  const pageSets = await resolveCheckoutDiscountForUser(sessionUser);

  return (
    <PageSetsProvider value={pageSets}>
      <PremiereGalApp />
    </PageSetsProvider>
  );
}
