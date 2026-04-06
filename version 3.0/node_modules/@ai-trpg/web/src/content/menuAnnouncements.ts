export type MenuAnnouncement = {
  id: string;
  publishedAt: string;
  title: string;
  body: string;
};

function parseAnnouncementId(path: string): string {
  return path.split("/").pop()?.replace(/\.txt$/i, "") ?? path;
}

function parseAnnouncementTitle(fileId: string): string {
  const [, titlePart = fileId] = fileId.split("__");
  return titlePart.replace(/_/g, " ");
}

function parseAnnouncementDate(fileId: string): string {
  const [datePart] = fileId.split("__");
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "1970-01-01";
}

const rawAnnouncements = import.meta.glob("./menu-notices/*.txt", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

export const MENU_ANNOUNCEMENTS: MenuAnnouncement[] = Object.entries(rawAnnouncements)
  .map(([path, body]) => {
    const id = parseAnnouncementId(path);
    return {
      id,
      publishedAt: parseAnnouncementDate(id),
      title: parseAnnouncementTitle(id),
      body: body.trim()
    };
  })
  .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
