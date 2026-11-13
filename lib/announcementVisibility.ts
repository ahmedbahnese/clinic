import type { NoticeAnnouncement, NoticeBarConfig, NoticeBarDisplayConfig } from '../types/cms';

export interface DisplayAnnouncement extends NoticeAnnouncement {
  title: string;
  summary: string;
}

function parseOptionalTimestamp(value?: string): number | null | undefined {
  if (!value?.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeAnnouncementLink(value?: string): string {
  const link = value?.trim() || '';
  if (!link || /[\u0000-\u001f\\]/.test(link)) return '';
  if (/^www\./i.test(link)) return `https://${link}`;
  return link;
}

export function isAnnouncementActiveAt(announcement: NoticeAnnouncement, now: number): boolean {
  if (announcement.is_enabled === false || announcement.show_on_site === false) return false;

  const startsAt = parseOptionalTimestamp(announcement.starts_at);
  const endsAt = parseOptionalTimestamp(announcement.ends_at);
  if (startsAt === undefined || endsAt === undefined) return false;
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) return false;
  if (startsAt !== null && startsAt > now) return false;
  if (endsAt !== null && endsAt <= now) return false;

  return Boolean(
    announcement.title?.trim() ||
      announcement.summary?.trim() ||
      announcement.message?.trim() ||
      announcement.details?.trim() ||
      announcement.image_url?.trim() ||
      announcement.link_url?.trim(),
  );
}

export function resolveNoticeAnnouncements(
  config: NoticeBarConfig | undefined,
  slot: NoticeBarDisplayConfig['placement'] | undefined,
  now: number,
  showFallback = true,
): DisplayAnnouncement[] {
  const selectedSlot = slot || config?.display?.placement || 'top';
  const activeCampaigns = (config?.announcements ?? []).filter((item) => {
    const itemSlot = item.display?.placement || config?.display?.placement || 'top';
    return itemSlot === selectedSlot && isAnnouncementActiveAt(item, now);
  });

  if (activeCampaigns.length > 0) {
    return activeCampaigns.map((item) => ({
      ...item,
      title: item.title?.trim() || '',
      summary: item.summary?.trim() || item.message?.trim() || '',
      link_url: normalizeAnnouncementLink(item.link_url || (item as NoticeAnnouncement & { link?: string; url?: string }).link || (item as NoticeAnnouncement & { url?: string }).url),
      link_label: item.link_label?.trim() || 'اضغط هنا',
    }));
  }

  if (!showFallback) return [];
  const legacyMessage = config?.message?.trim() || 'الحجز الإلكتروني متاح بنظام تذاكر الدور وأسبقية الحضور اليومي بالعيادات التخصصية.';
  return [{
    id: 'legacy-notice',
    title: config?.title?.trim() || 'تنظيم العيادات الخارجية:',
    summary: legacyMessage,
    details: legacyMessage,
  }];
}
