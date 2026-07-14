"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useAnimation } from "motion/react";
import { LoaderCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fadeUp, shake } from "@/components/motion/variants";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";

export default function SystemRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const cardControls = useAnimation();

  React.useEffect(() => {
    cardControls.start("visible");
  }, [cardControls]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    if (password !== confirm) {
      toast.error("Passwords do not match");
      cardControls.start(shake);
      return;
    }
    setLoading(true);
    try {
      await api("/system/register", {
        method: "POST",
        auth: false,
        body: {
          fName: String(formData.get("fName") ?? ""),
          username: String(formData.get("username") ?? ""),
          email: String(formData.get("email") ?? ""),
          password,
        },
      });
      toast.success("Account created. Please sign in.");
      router.push("/system/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
      setLoading(false);
      cardControls.start(shake);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
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
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <UserPlus className="size-6" />
              </div>
              <CardTitle className="text-xl">Create system account</CardTitle>
              <CardDescription>
                Register to access the system console
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="fName">Full name</Label>
                  <Input id="fName" name="fName" placeholder="Jane Doe" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    placeholder="jane.doe"
                    autoComplete="username"
                    required
                    minLength={3}
                    pattern="[a-zA-Z0-9._-]+"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jane@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Min 8 chars with uppercase, lowercase and a digit.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <LoaderCircle className="size-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            </CardContent>
            <CardFooter className="justify-center text-sm text-muted-foreground">
              Already registered?
              <Link
                href="/system/login"
                className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
