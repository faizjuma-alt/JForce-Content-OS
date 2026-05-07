import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Nav from "@/components/Nav";
import type { ReactNode } from "react";

export default async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <>
      <Nav email={session.user.email} signOutAction={signOutAction} />
      <main className="max-w-7xl mx-auto p-6 pb-24">{children}</main>
    </>
  );
}
