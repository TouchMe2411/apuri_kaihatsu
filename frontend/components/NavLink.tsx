"use client";

import { Badge } from "@/components/ui/badge";
import { Link } from "@/navigation";
import { usePathname } from "@/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

interface NavLinkProps {
  href: string;
  Icon: React.ElementType;
  name: string;
  badge?: number;
}

const NavLink: React.FC<NavLinkProps> = ({ href, Icon, name, badge }) => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: notificationCount } = useQuery<number>({
    queryKey: ["FormsCount", name],
    queryFn: async () => {
      if (href !== "/forms") return 0;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/form/count`,
        {
          headers: {
            Authorization: `Bearer ${session?.sessionToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      const count = await res.json();
      return count.form_count;
    },
    enabled: !!session?.sessionToken,
  });

  const isActive = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 rounded-lg px-4 py-3 text-foreground/70 transition-all hover:text-primary ${
        isActive
          ? "bg-background/90 text-primary font-medium shadow-sm before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-lg before:bg-gradient-primary"
          : "hover:bg-background/50"
      }`}
    >
      <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
      <span>{name}</span>
      {!!notificationCount && (
        <Badge className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-white">
          {notificationCount}
        </Badge>
      )}
    </Link>
  );
};

export default NavLink;
