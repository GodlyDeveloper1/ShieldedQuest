// App frame: sidebar navigation for hunts, create, a hunt, and docs.
import { chainStatus } from "@/lib/signer";
import Sidebar from "@/app/components/Sidebar";
import XRay from "@/app/components/XRay";
import QuestGuide from "@/app/components/QuestGuide";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const status = await chainStatus();
  return (
    <div className="app">
      <Sidebar status={status} />
      <div className="app-main">{children}</div>
      <div className="fab-dock">
        <QuestGuide />
        <XRay />
      </div>
    </div>
  );
}
