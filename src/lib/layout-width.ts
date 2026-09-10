/**
 * Pure module for content container width rules.
 *
 * Determines the appropriate max-width Tailwind class based on the current route,
 * keeping this module Prisma-free so it remains client-safe.
 */

/**
 * Get the Tailwind max-width class for the app's content container based on pathname.
 *
 * Returns "max-w-[1360px]" for the group-coupon builder route,
 * and "max-w-4xl" for all other routes.
 * Handles null/undefined pathname defensively by returning the default.
 */
export function getLayoutWidthClass(pathname: string | null | undefined): string {
  if (!pathname) {
    return "max-w-4xl";
  }

  // Full-width for the group-coupon builder: /admin/rounds/:id/group-coupon
  if (pathname.includes("/admin/rounds/") && pathname.endsWith("/group-coupon")) {
    return "max-w-[1360px]";
  }

  return "max-w-4xl";
}
