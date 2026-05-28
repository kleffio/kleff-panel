import type { Metadata } from "next";
import { AdminMembersPage } from "@/features/admin/pages/AdminMembersPage";

export const metadata: Metadata = { title: "Members — Admin" };

export default function AdminMembersRoute() {
  return <AdminMembersPage />;
}
