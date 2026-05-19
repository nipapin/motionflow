import { ProfileShell } from "@/components/profile-shell";

export default function ProfileShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ProfileShell>{children}</ProfileShell>;
}
