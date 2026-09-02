import { CepExtensionAuthDialog } from "@/components/cep-extension-auth-dialog";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { GAL_CEP_CLIENT, normalizeCepClient } from "@/lib/cep-client-registry";
import { resolveCheckoutDiscountForUser } from "@/lib/premiere-gal-discount";
import { PageSetsProvider } from "./page-sets-context";
import PremiereGalApp from "./premiere-gal-app";

/** Port of `resources/views/premieregal/main.blade.php` + `App.jsx`. */
export default async function PremiereGalPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; client?: string }>;
}) {
  const sessionUser = await getSessionUser();
  const pageSets = await resolveCheckoutDiscountForUser(sessionUser);
  const { code, client: clientRaw } = await searchParams;

  return (
    <PageSetsProvider value={pageSets}>
      <CepExtensionAuthDialog
        initialCode={code ?? ""}
        initialClient={
          typeof clientRaw === "string" && clientRaw.trim()
            ? normalizeCepClient(clientRaw)
            : GAL_CEP_CLIENT
        }
      />
      <PremiereGalApp />
    </PageSetsProvider>
  );
}
