import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      displayName: true,
      gameName: true,
      tarkovProfileId: true,
      tarkovProfileMode: true,
      tarkovPveProfileId: true,
      tarkovArenaProfileId: true,
      pubgSteamUser: true,
      pubgXboxUser: true,
      pubgPsnUser: true
    }
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle className="mb-2">Profile Settings</CardTitle>
        <p className="max-w-3xl text-sm text-[#9a9080]">
          Save your real Tarkov in-game name here, then attach your public Tarkov.dev player profile so this app has a stable stats destination for your account.
        </p>
      </Card>

      <Card>
        <ProfileSettingsForm
          displayName={user.displayName}
          gameName={user.gameName}
          tarkovProfileId={user.tarkovProfileId}
          tarkovPveProfileId={user.tarkovPveProfileId}
          tarkovArenaProfileId={user.tarkovArenaProfileId}
          pubgSteamUser={user.pubgSteamUser}
          pubgXboxUser={user.pubgXboxUser}
          pubgPsnUser={user.pubgPsnUser}
        />
      </Card>
    </div>
  );
}