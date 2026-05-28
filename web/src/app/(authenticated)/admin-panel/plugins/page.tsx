import type { Metadata } from "next";
import { InfraPluginsPage } from "@/features/plugins/pages/InfraPluginsPage";

export const metadata: Metadata = { title: "Infrastructure Plugins" };

export default function AdminPluginsPage() {
  return <InfraPluginsPage />;
}
