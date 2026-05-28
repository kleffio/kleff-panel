import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ ns: string; env: string }> }) {
  const { ns, env } = await params;
  redirect(`/${ns}/${env}`);
}
