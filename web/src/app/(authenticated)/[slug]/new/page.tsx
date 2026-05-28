import { Suspense } from "react";
import { NamespaceEnvironmentCreatePage } from "@/features/namespaces/pages/NamespaceEnvironmentCreatePage";

export default function Page() {
  return (
    <Suspense>
      <NamespaceEnvironmentCreatePage />
    </Suspense>
  );
}
