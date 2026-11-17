// The admin's pages and their addresses. Hash routes (`#activities`, `#activities/ph-0102`, `#new-activity`,
// `#speech/phoneme-sh`, `#bank`, `#pictures/draw`, `#levels/zigzag`): the site is static files behind CloudFront, so a hash needs no server rewrite, and
// each page has a link that can go into review notes. Back and Forward work because the app follows `hashchange`.

export type Route =
  | { readonly page: "activities" }
  | { readonly page: "activity"; readonly id: string }
  | { readonly page: "new" }
  | { readonly page: "speech"; readonly id: string | null }
  | { readonly page: "bank" }
  | { readonly page: "pictures"; readonly tab: PictureTab }
  | { readonly page: "levels" }
  | { readonly page: "level"; readonly id: string };

/** The Pictures page's tabs (Phases 42a and 42b). */
export const PICTURE_TABS = ["upload", "draw", "library"] as const;
export type PictureTab = (typeof PICTURE_TABS)[number];

/** Key IDs (spine S9.5). Anything else in the address is ignored rather than passed to the API. */
const ID = /^[a-z0-9-]{1,40}$/u;

export function parseRoute(hash: string): Route {
  const [page = "", id] = hash.replace(/^#/u, "").split("/");
  const goodId = id !== undefined && ID.test(id) ? id : null;
  switch (page) {
    case "speech":
      return { page: "speech", id: goodId };
    case "bank":
      return { page: "bank" };
    case "pictures":
      return { page: "pictures", tab: PICTURE_TABS.find((t) => t === id) ?? "upload" };
    case "new-activity":
      return { page: "new" };
    case "levels":
      return goodId === null ? { page: "levels" } : { page: "level", id: goodId };
    case "activities":
      return goodId === null ? { page: "activities" } : { page: "activity", id: goodId };
    default:
      return { page: "activities" }; // the home page: the activity list (D §D8.1 A2)
  }
}

export function hrefOf(route: Route): string {
  switch (route.page) {
    case "activities":
      return "#activities";
    case "activity":
      return `#activities/${route.id}`;
    case "speech":
      return route.id === null ? "#speech" : `#speech/${route.id}`;
    case "bank":
      return "#bank";
    case "new":
      return "#new-activity";
    case "pictures":
      return route.tab === "upload" ? "#pictures" : `#pictures/${route.tab}`;
    case "levels":
      return "#levels";
    case "level":
      return `#levels/${route.id}`;
  }
}

/** The navigation tab a route belongs to. */
export type Section = "activities" | "speech" | "pictures" | "levels" | "bank";

export function sectionOf(route: Route): Section {
  if (route.page === "activity" || route.page === "new") return "activities";
  return route.page === "level" ? "levels" : route.page;
}

export const SECTIONS: readonly { readonly section: Section; readonly label: string; readonly href: string }[] = [
  { section: "activities", label: "Activities", href: "#activities" },
  { section: "speech", label: "Speech", href: "#speech" },
  { section: "pictures", label: "Pictures", href: "#pictures" },
  { section: "levels", label: "Levels", href: "#levels" },
  { section: "bank", label: "Bank status", href: "#bank" },
];
