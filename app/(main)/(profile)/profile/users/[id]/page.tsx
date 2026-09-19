import { redirect } from "next/navigation";

export default function AdminUserDetailRedirect() {
  redirect("/profile/users");
}
