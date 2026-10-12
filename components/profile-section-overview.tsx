import { ProfileNavigationCard, PROFILE_CARD_GRID } from "@/components/profile-navigation-card";
import { PROFILE_NAVIGATION_GROUPS, type ProfileNavigationGroup, type ProfileNavigationItem } from "@/lib/profile-navigation";

export function ProfileSectionOverview({ group, items }: { group: ProfileNavigationGroup; items: ProfileNavigationItem[] }) {
  const section = PROFILE_NAVIGATION_GROUPS[group];
  return (
    <div className="w-full space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-blue-400">Workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">{section.label}</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{section.description}</p>
      </header>
      <div className={PROFILE_CARD_GRID}>
        {items.map((item) => <ProfileNavigationCard key={item.href} {...item} />)}
      </div>
    </div>
  );
}
