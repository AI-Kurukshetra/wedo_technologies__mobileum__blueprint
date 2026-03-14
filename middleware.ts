import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup"];

function hasSupabaseAuthCookies(req: NextRequest) {
  const cookies = req.cookies.getAll();
  return cookies.some((c) => {
    const name = c.name.toLowerCase();
    return name.startsWith("sb-") || name.includes("supabase") || name.includes("auth-token") || name.includes("refresh-token");
  });
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: req.headers } });
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isPublic && !hasSupabaseAuthCookies(req)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request: { headers: req.headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
