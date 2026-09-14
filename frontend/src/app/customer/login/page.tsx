"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimation } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fadeUp, shake } from "@/components/motion/variants";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  setCustomerAccessToken,
  customerApi,
  type CustomerLoginResponse,
} from "@/lib/customer-api";
import { APP_NAME } from "@/lib/app-name";
import { AppLogo } from "@/components/app-logo";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const cardControls = useAnimation();

  React.useEffect(() => {
    cardControls.start("visible");
  }, [cardControls]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const result = await customerApi<CustomerLoginResponse>("/customer/auth/login", {
        method: "POST",
        auth: false,
        body: {
          username: String(formData.get("username") ?? ""),
          password: String(formData.get("password") ?? ""),
        },
      });
      setCustomerAccessToken(result.accessToken);
      toast.success(`Welcome back, ${result.customer.fName}!`);
      router.replace(result.redirectTo || "/customer/streams");
    } catch (error) {
      // The API reports a wrong username and a wrong password identically, so
      // there is nothing more specific to show here by design.
      toast.error(error instanceof Error ? error.message : "Login failed");
      setLoading(false);
      cardControls.start(shake);
    }
  }

  return (
    <main className="bg-background flex min-h-dvh flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <motion.div
          className="w-full max-w-sm"
          initial="hidden"
          animate={cardControls}
          variants={fadeUp}
        >
          <Card className="w-full">
            <CardHeader className="text-center">
              <AppLogo size={48} priority className="mx-auto mb-2 rounded-xl" />
              <CardTitle className="text-xl">{APP_NAME}</CardTitle>
              <CardDescription>Sign in to your streaming account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    required
                    minLength={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <LoaderCircle className="size-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
