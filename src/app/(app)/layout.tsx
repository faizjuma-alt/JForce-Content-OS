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
    <div className="min-h-screen flex flex-col">
      <Nav email={session.user.email} signOutAction={signOutAction} />
      <main className="max-w-7xl mx-auto w-full p-6 flex-1">{children}</main>
      <footer className="border-t border-line bg-card/40 mt-10">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-soft">
          <div>
            Built by{" "}
            
              href="https://www.youtube.com/@yankeesolutions"
              target="_blank"
              rel="noreferrer noopener"
              className="text-orange-100 hover:underline font-semibold"
            >
              Yankee Solutions
            </a>{" "}
            · &copy; 2026
          </div>
          <div className="opacity-70">JForce Faceless Reels Engine · v1.0</div>
        </div>
      </footer>
    </div>
  );
}