import { redirect } from "next/navigation";

export default function TenantHome() {
  redirect("/tenant/login");
}
