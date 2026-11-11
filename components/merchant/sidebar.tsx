"use client";

import {
  Camera,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  Settings2,
  ShoppingBag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/merchant/actions";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  prominent?: boolean;
};

const navigationItems: NavigationItem[] = [
  { href: "/merchant", label: "Overview", icon: LayoutDashboard },
  { href: "/merchant/capture", label: "Capture", icon: Camera, prominent: true },
  { href: "/merchant/products", label: "Products", icon: Package },
  { href: "/merchant/orders", label: "Orders", icon: ShoppingBag },
  { href: "/merchant/negotiations", label: "Negotiations", icon: MessageSquareText },
  { href: "/merchant/settings", label: "Settings", icon: Settings2 },
];

function currentNavigationHref(pathname: string): string | undefined {
  return navigationItems
    .filter(({ href }) => href === "/merchant"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const activeHref = currentNavigationHref(pathname);

  return (
    <nav aria-label="Merchant navigation" className="merchant-nav">
      {navigationItems.map(({ href, label, icon: Icon, prominent }) => {
        const link = (
          <Link
            aria-current={href === activeHref ? "page" : undefined}
            className={`merchant-nav-link${prominent ? " merchant-nav-capture" : ""}`}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );

        return mobile ? (
          <SheetClose asChild key={href}>
            {link}
          </SheetClose>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function LogoutControl({ mobile = false }: { mobile?: boolean }) {
  const button = (
    <button className="merchant-logout" type="submit">
      <LogOut aria-hidden="true" />
      <span>Logout</span>
    </button>
  );

  return (
    <form action={logoutAction}>
      {mobile ? <SheetClose asChild>{button}</SheetClose> : button}
    </form>
  );
}

function NavigationContents({ merchantName, mobile = false }: { merchantName: string; mobile?: boolean }) {
  const initials = merchantName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <div className="merchant-sidebar-brand">
        <Logo />
      </div>
      <p className="merchant-shop-label">Shop workspace</p>
      <NavigationLinks mobile={mobile} />
      <div className="sidebar-spacer" />
      <div className="merchant-sidebar-status">
        <span aria-hidden="true" className="merchant-avatar">
          {initials || "AS"}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="merchant-account-name">{merchantName}</div>
          <div className="merchant-account-caption">Merchant account</div>
        </div>
      </div>
      <LogoutControl mobile={mobile} />
    </>
  );
}

export function MerchantSidebar({ merchantName }: { merchantName: string }) {
  return (
    <aside aria-label="Shop workspace" className="merchant-sidebar">
      <NavigationContents merchantName={merchantName} />
    </aside>
  );
}

export function MerchantMobileMenu({ merchantName }: { merchantName: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label="Open shop navigation"
          className="merchant-mobile-menu"
          size="icon"
          variant="ghost"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[280px] bg-sidebar p-0 sm:max-w-[280px]" side="left">
        <SheetHeader className="sr-only">
          <SheetTitle>Shop navigation</SheetTitle>
        </SheetHeader>
        <div className="merchant-sidebar merchant-sidebar-mobile">
          <NavigationContents merchantName={merchantName} mobile />
        </div>
      </SheetContent>
    </Sheet>
  );
}
