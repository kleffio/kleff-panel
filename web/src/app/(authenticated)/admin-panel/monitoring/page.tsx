import type { Metadata } from "next";
import { AdminMonitoringPage } from "@/features/admin/pages/AdminMonitoringPage";

export const metadata: Metadata = { title: "Infrastructure Monitoring" };

export default function AdminMonitoringRoute() {
  return <AdminMonitoringPage />;
}
