"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, MapPin, Save, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { LocationPickerPanel } from "@/components/location-picker-panel";
import { UPLOADS_ORIGIN } from "@/lib/api";
import { ID_PROOF_TYPES } from "@/lib/id-proof-types";
import { TAX_TYPES } from "@/lib/tax-types";
import {
  customerApi,
  CustomerApiError,
  setCustomerAccessToken,
  uploadCustomerPicture,
  type CustomerCredentialsResult,
  type CustomerProfileDetails,
} from "@/lib/customer-api";

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "TRANSGENDER", label: "Transgender" },
  { value: "NOT_TO_SAY", label: "Prefer not to say" },
  { value: "NONE", label: "Not specified" },
] as const;

/** What the picture endpoint accepts; enforced again on the server. */
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PICTURE_MAX_BYTES = 1024 * 1024;

const NONE = "__none__";

interface FormValues {
  lName: string;
  fatherName: string;
  gender: string;
  dateOfBirth: string;
  secondaryMobile: string;
  place: string;
  street: string;
  addressLine1: string;
  addressLine2: string;
  pincode: string;
  latitude: string;
  longitude: string;
  idProofType: string;
  idProofNumber: string;
  taxType: string;
  taxNumber: string;
}

function formFrom(profile: CustomerProfileDetails): FormValues {
  return {
    lName: profile.lName ?? "",
    fatherName: profile.fatherName ?? "",
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth ?? "",
    secondaryMobile: profile.secondaryMobile ?? "",
    place: profile.place ?? "",
    street: profile.street ?? "",
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2 ?? "",
    pincode: profile.pincode ?? "",
    latitude: profile.latitude === null ? "" : String(profile.latitude),
    longitude: profile.longitude === null ? "" : String(profile.longitude),
    idProofType: profile.idProofType ?? "",
    idProofNumber: profile.idProofNumber ?? "",
    taxType: profile.taxType ?? "",
    taxNumber: profile.taxNumber ?? "",
  };
}

/**
 * An emptied field is sent as null, not undefined: undefined is dropped from
 * the JSON body and read as "leave unchanged", so without this a field could
 * never be cleared once filled.
 */
function clearable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function clearableNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export default function CustomerProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = React.useState<CustomerProfileDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormValues | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [mapOpen, setMapOpen] = React.useState(false);

  const [credentials, setCredentials] = React.useState({
    currentPassword: "",
    username: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingCredentials, setSavingCredentials] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const me = await customerApi<CustomerProfileDetails>("/customer/profile");
      setProfile(me);
      setForm(formFrom(me));
      setCredentials((c) => ({ ...c, username: me.username ?? "" }));
      setError(null);
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "Could not load your profile");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function patch(next: Partial<FormValues>) {
    setForm((f) => (f ? { ...f, ...next } : f));
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await customerApi<CustomerProfileDetails>("/customer/profile", {
        method: "PATCH",
        body: {
          lName: clearable(form.lName),
          fatherName: clearable(form.fatherName),
          gender: form.gender,
          dateOfBirth: clearable(form.dateOfBirth),
          secondaryMobile: clearable(form.secondaryMobile),
          place: clearable(form.place),
          street: clearable(form.street),
          addressLine1: form.addressLine1,
          addressLine2: clearable(form.addressLine2),
          pincode: clearable(form.pincode),
          latitude: clearableNumber(form.latitude),
          longitude: clearableNumber(form.longitude),
          idProofType: clearable(form.idProofType),
          idProofNumber: clearable(form.idProofNumber),
          taxType: clearable(form.taxType),
          taxNumber: clearable(form.taxNumber),
        },
      });
      setProfile(updated);
      setForm(formFrom(updated));
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  async function onPickPicture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the input straight away, so picking the same file again still fires.
    event.target.value = "";
    if (!file) return;

    // Checked here as well as on the server, to save the customer a 1 MB
    // upload that is only going to be rejected.
    if (!PICTURE_TYPES.includes(file.type)) {
      toast.error("Choose a PNG, JPG, JPEG or WEBP image");
      return;
    }
    if (file.size > PICTURE_MAX_BYTES) {
      toast.error(`That image is ${formatBytes(file.size)}. The limit is 1 MB.`);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadCustomerPicture(file);
      setProfile(result);
      toast.success(`Picture updated — stored as WEBP, ${formatBytes(result.bytes)}`);
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Could not upload the picture");
    } finally {
      setUploading(false);
    }
  }

  async function onSaveCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wantsUsername = credentials.username.trim() !== profile?.username;
    const wantsPassword = credentials.newPassword !== "";

    if (!wantsUsername && !wantsPassword) {
      toast.error("Change the username or the password first");
      return;
    }
    if (wantsPassword && credentials.newPassword !== credentials.confirmPassword) {
      toast.error("The new passwords do not match");
      return;
    }

    setSavingCredentials(true);
    try {
      const result = await customerApi<CustomerCredentialsResult>(
        "/customer/profile/credentials",
        {
          method: "PATCH",
          body: {
            currentPassword: credentials.currentPassword,
            ...(wantsUsername ? { username: credentials.username.trim() } : {}),
            ...(wantsPassword ? { newPassword: credentials.newPassword } : {}),
          },
        },
      );

      // Every session ended on the server, so this one is already dead: drop
      // the token and send them to sign in with the new details.
      toast.success(
        result.usernameChanged && result.passwordChanged
          ? "Username and password changed. Please sign in again."
          : result.passwordChanged
            ? "Password changed. Please sign in again."
            : "Username changed. Please sign in again.",
      );
      setCustomerAccessToken(null);
      router.replace("/customer/login");
    } catch (err) {
      toast.error(
        err instanceof CustomerApiError ? err.message : "Could not change your sign-in details",
      );
      setSavingCredentials(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!profile || !form) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading your profile...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">My Profile</h1>
        <p className="text-muted-foreground text-sm">
          Your details as your provider holds them. Your name, mobile number and email are set by
          your provider — ask them to change those.
        </p>
      </div>

      <Card>
        {/* Stacked on a phone, one row from sm up. A single wrapping row is
            what crushed the name and the hint into one-word-per-line columns:
            min-w-0 let the text shrink to nothing instead of forcing a wrap. */}
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full sm:size-20">
              {profile.customerPicture ? (
                // eslint-disable-next-line @next/next/no-img-element -- the storage origin is not a configured Next image domain
                <img
                  src={`${UPLOADS_ORIGIN}/uploads/${profile.customerPicture}`}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <UserRound className="text-muted-foreground size-7 sm:size-8" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-medium break-words">
                  {profile.fName}
                  {profile.lName ? ` ${profile.lName}` : ""}
                </span>
                <Badge variant="secondary">{profile.customerCode}</Badge>
                {profile.status !== "ACTIVE" && <Badge variant="warning">{profile.status}</Badge>}
              </div>
              {/* A long email has nowhere to break on a narrow screen, so it is
                  allowed to break anywhere rather than widening the card. */}
              <div className="text-muted-foreground text-sm break-all sm:break-normal">
                {profile.primaryMobile}
                {profile.email ? ` · ${profile.email}` : ""}
              </div>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onPickPicture}
          />

          <div className="sm:ml-auto sm:shrink-0 sm:text-right">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {profile.customerPicture ? "Change picture" : "Add picture"}
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">
              PNG, JPG, JPEG or WEBP, up to 1 MB. It is converted to WEBP when saved.
            </p>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSave}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>Leave a field empty to clear it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lName">Last name</Label>
                <Input
                  id="lName"
                  value={form.lName}
                  maxLength={100}
                  onChange={(e) => patch({ lName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fatherName">Father&apos;s name</Label>
                <Input
                  id="fatherName"
                  value={form.fatherName}
                  maxLength={150}
                  onChange={(e) => patch({ fatherName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => patch({ gender: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  // A birthday is never in the future; the server checks too.
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => patch({ dateOfBirth: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="secondaryMobile">Alternate mobile</Label>
                <Input
                  id="secondaryMobile"
                  value={form.secondaryMobile}
                  maxLength={20}
                  inputMode="tel"
                  onChange={(e) => patch({ secondaryMobile: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Primary mobile</Label>
                <Input value={profile.primaryMobile} readOnly disabled />
                <p className="text-muted-foreground text-xs">Set by your provider.</p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="place">Place</Label>
                <Input
                  id="place"
                  value={form.place}
                  maxLength={150}
                  onChange={(e) => patch({ place: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="street">Street</Label>
                <Input
                  id="street"
                  value={form.street}
                  maxLength={150}
                  onChange={(e) => patch({ street: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="addressLine1">Address line 1</Label>
                <Input
                  id="addressLine1"
                  required
                  value={form.addressLine1}
                  maxLength={255}
                  onChange={(e) => patch({ addressLine1: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="addressLine2">Address line 2</Label>
                <Input
                  id="addressLine2"
                  value={form.addressLine2}
                  maxLength={255}
                  onChange={(e) => patch({ addressLine2: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  value={form.pincode}
                  maxLength={15}
                  inputMode="numeric"
                  onChange={(e) => patch({ pincode: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="min-w-0 flex-1"
                    value={
                      form.latitude && form.longitude
                        ? `${Number(form.latitude).toFixed(5)}, ${Number(form.longitude).toFixed(5)}`
                        : ""
                    }
                    placeholder="Not set"
                    readOnly
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="Pick your location on the map"
                    onClick={() => setMapOpen(true)}
                  >
                    <MapPin className="size-4" />
                  </Button>
                  {(form.latitude || form.longitude) && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => patch({ latitude: "", longitude: "" })}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>ID proof type</Label>
                <Select
                  value={form.idProofType || NONE}
                  onValueChange={(v) => patch({ idProofType: v === NONE ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {ID_PROOF_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="idProofNumber">ID proof number</Label>
                <Input
                  id="idProofNumber"
                  value={form.idProofNumber}
                  maxLength={100}
                  onChange={(e) => patch({ idProofNumber: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Tax type</Label>
                <Select
                  value={form.taxType || NONE}
                  onValueChange={(v) => patch({ taxType: v === NONE ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {TAX_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxNumber">Tax number</Label>
                <Input
                  id="taxNumber"
                  value={form.taxNumber}
                  maxLength={100}
                  onChange={(e) => patch({ taxNumber: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(formFrom(profile))}
                disabled={saving}
              >
                Reset
              </Button>
              <Button type="submit" disabled={saving || !form.addressLine1.trim()}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <form onSubmit={onSaveCredentials}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" /> Sign-in details
            </CardTitle>
            <CardDescription>
              Changing your username or password signs you out everywhere, including here, so you
              will need to sign in again.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={credentials.currentPassword}
                  onChange={(e) =>
                    setCredentials((c) => ({ ...c, currentPassword: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  minLength={3}
                  maxLength={50}
                  value={credentials.username}
                  onChange={(e) => setCredentials((c) => ({ ...c, username: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="Leave empty to keep it"
                  value={credentials.newPassword}
                  onChange={(e) => setCredentials((c) => ({ ...c, newPassword: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={credentials.confirmPassword}
                  onChange={(e) =>
                    setCredentials((c) => ({ ...c, confirmPassword: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex sm:justify-end">
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={savingCredentials || !credentials.currentPassword}
              >
                {savingCredentials ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Update and sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Your location</DialogTitle>
          </DialogHeader>
          <LocationPickerPanel
            initialLat={form.latitude ? Number(form.latitude) : null}
            initialLng={form.longitude ? Number(form.longitude) : null}
            showRadius={false}
            onCancel={() => setMapOpen(false)}
            onConfirm={(lat, lng) => {
              patch({ latitude: String(lat), longitude: String(lng) });
              setMapOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
