import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function clearAuthCookies(response: NextResponse, request: NextRequest): void {
  const authCookies = request.cookies.getAll().filter((cookie) =>
    cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")
  );

  authCookies.forEach((cookie) => {
    response.cookies.set({
      name: cookie.name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  });
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Clear invalid auth cookies if user is null (middleware validates JWT; null means invalid/forged)
  if (!user) {
    clearAuthCookies(response, request);
  }

  // Protected routes - redirect to home if not authenticated
  const protectedPaths = [
    "/rounds",
    "/leaderboard",
    "/fedt",
    "/profile",
    "/admin",
  ];

  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtected && !user) {
    const redirectResponse = NextResponse.redirect(new URL("/", request.url));
    clearAuthCookies(redirectResponse, request);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
