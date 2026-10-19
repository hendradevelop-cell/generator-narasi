import TopBar from "@/components/TopBar";

// Layout ini selalu merender {children}; guard auth ada di tiap page supaya
// Next.js tidak menganggap segmen page "dropped" saat validasi prerender.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">{children}</main>
    </>
  );
}
