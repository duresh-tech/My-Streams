"use client";

import * as React from "react";
import { LoaderCircle, Save, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UPLOADS_ORIGIN } from "@/lib/api";
import {
  TenantApiError,
  tenantApi,
  uploadTenantBusinessLogo,
  type TenantBusinessProfile,
} from "@/lib/tenant-api";
import { useTenantSession } from "@/hooks/use-tenant-session";

interface FormValues {
  name: string;
  tagLine: string;
  email: string;
  phone: string;
  country: string;
  countryCode: string;
  state: string;
  city: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string;
  taxNumber: string;
}

const EMPTY_FORM: FormValues = {
  name: "",
  tagLine: "",
  email: "",
  phone: "",
  country: "",
  countryCode: "",
  state: "",
  city: "",
  pincode: "",
  addressLine1: "",
  addressLine2: "",
  taxNumber: "",
};

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

export default function TenantBusinessInformationPage() {
  const { hasPermission } = useTenantSession();
  const canView = hasPermission("tenant-business:view");
  const canUpdate = hasPermission("tenant-business:update");

  const [profile, setProfile] = React.useState<TenantBusinessProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    tenantApi<TenantBusinessProfile>("/tenant/business")
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setForm({
          name: data.name,
          tagLine: data.tagLine ?? "",
          email: data.email,
          phone: data.phone,
          country: data.country,
          countryCode: data.countryCode,
          state: data.state,
          city: data.city,
          pincode: data.pincode,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2 ?? "",
          taxNumber: data.taxNumber ?? "",
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(
          error instanceof TenantApiError ? error.message : "Failed to load business information",
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canView]);

  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { path } = await uploadTenantBusinessLogo(file);
      setProfile((p) => (p ? { ...p, logoPath: path } : p));
      toast.success("Business logo updated");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await tenantApi<TenantBusinessProfile>("/tenant/business", {
        method: "PATCH",
        body: {
          name: form.name,
          tagLine: form.tagLine || undefined,
          email: form.email,
          phone: form.phone,
          country: form.country,
          countryCode: form.countryCode,
          state: form.state,
          city: form.city,
          pincode: form.pincode,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || undefined,
          taxNumber: form.taxNumber || undefined,
        },
      });
      setProfile(updated);
      toast.success("Business information updated");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Business Information</CardTitle>
          <CardDescription>You don&apos;t have permission to view business information.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Business Information</CardTitle>
          <CardDescription>{loadError ?? "Failed to load business information."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Business Information</CardTitle>
        <CardDescription>
          {canUpdate
            ? "Update your business profile, contact and address details below."
            : "Your business profile, contact and address details."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-6">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted">
              {profile.logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${UPLOADS_ORIGIN}/uploads/${profile.logoPath}`}
                  alt="Business logo"
                  className="size-full object-cover"
                />
              ) : (
                <Upload className="size-6 text-muted-foreground/60" />
              )}
            </div>
            {canUpdate && (
              <>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onLogoSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {uploadingLogo && <LoaderCircle className="size-4 animate-spin" />}
                  {profile.logoPath ? "Change logo" : "Upload logo"}
                </Button>
              </>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {profile.isParentBusiness ? (
                <Badge variant="secondary">Parent</Badge>
              ) : (
                <Badge variant="outline">Child</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Business name
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="name"
                required
                disabled={!canUpdate}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tagLine">Tag line</Label>
              <Input
                id="tagLine"
                disabled={!canUpdate}
                value={form.tagLine}
                onChange={(e) => setForm((f) => ({ ...f, tagLine: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="email">
                Email
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="email"
                type="email"
                required
                disabled={!canUpdate}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">
                Phone
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="phone"
                required
                disabled={!canUpdate}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="country">
                Country
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="country"
                required
                disabled={!canUpdate}
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="countryCode">
                Country code
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="countryCode"
                required
                disabled={!canUpdate}
                value={form.countryCode}
                onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="state">
                State
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="state"
                required
                disabled={!canUpdate}
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city">
                City
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="city"
                required
                disabled={!canUpdate}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pincode">
                Pincode
                {canUpdate && <RequiredMark />}
              </Label>
              <Input
                id="pincode"
                required
                disabled={!canUpdate}
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="taxNumber">Tax number</Label>
              <Input
                id="taxNumber"
                disabled={!canUpdate}
                value={form.taxNumber}
                onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="addressLine1">
              Address line 1
              {canUpdate && <RequiredMark />}
            </Label>
            <Input
              id="addressLine1"
              required
              disabled={!canUpdate}
              value={form.addressLine1}
              onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="addressLine2">Address line 2</Label>
            <Input
              id="addressLine2"
              disabled={!canUpdate}
              value={form.addressLine2}
              onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
            />
          </div>

          {canUpdate && (
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
