import type { Metadata } from "next";
import { AdminAuditPage } from "@/features/admin/pages/AdminAuditPage";

export const metadata: Metadata = { title: "Audit Log — Admin" };

export default function AdminAuditRoute() {
  return <AdminAuditPage />;
}
