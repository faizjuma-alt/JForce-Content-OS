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
      <footer className="border-t border-line mt-10 py-5 text-xs text-center text-soft">
        Built by <a href="https://www.youtube.com/@yankeesolutions" target="_blank" rel="noreferrer noopener" className="text-orange-100 font-semibold hover:underline">Yankee Solutions</a> {"\u00B7 \u00A9 2026"}
      </footer>
    </>
  );
}