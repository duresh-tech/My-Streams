import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface LogoProps {
  name: string;
  src: string;
  className?: string;
  /** Mark shown on its own - used in tight spots like the mobile header. */
  markOnly?: boolean;
}

export function Logo({ name, src, className, markOnly = false }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2.5 shrink-0", className)}
      aria-label={`${name} home`}
    >
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        priority
        className="h-9 w-9 object-contain"
      />
      {!markOnly && (
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-foreground">My</span>
          <span className="text-gradient">Streams</span>
        </span>
      )}
    </Link>
  );
}
