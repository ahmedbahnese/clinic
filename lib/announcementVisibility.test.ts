import test from 'node:test';
import assert from 'node:assert/strict';
import { isAnnouncementActiveAt, resolveNoticeAnnouncements } from './announcementVisibility.ts';
import type { NoticeAnnouncement, NoticeBarConfig } from '../types/cms';

const now = Date.parse('2026-11-12T04:00:00.000Z');

function announcement(overrides: Partial<NoticeAnnouncement> = {}): NoticeAnnouncement {
  return {
    id: 'announcement-1',
    title: 'تنبيه العيادة',
    summary: 'تحديث مواعيد العمل',
    ...overrides,
  };
}

function config(overrides: Partial<NoticeBarConfig> = {}): NoticeBarConfig {
  return {
    is_enabled: true,
    title: 'التنبيه القديم',
    message: 'النص القديم يظل محفوظًا',
    hotline_label: 'المستشفى',
    announcements: [announcement()],
    ...overrides,
  };
}

test('الإعلان المنشور يظهر افتراضيًا ما لم يُوقف صراحةً', () => {
  assert.equal(isAnnouncementActiveAt(announcement(), now), true);
  assert.equal(isAnnouncementActiveAt(announcement({ is_enabled: false }), now), false);
  assert.equal(isAnnouncementActiveAt(announcement({ show_on_site: false }), now), false);
});

test('الجدولة تعرض الإعلان من لحظة البداية وتخفيه عند نهاية العرض', () => {
  const scheduled = announcement({ starts_at: '2026-11-12T04:00:00.001Z', ends_at: '2026-11-12T05:00:00.000Z' });
  assert.equal(isAnnouncementActiveAt(scheduled, now), false);
  assert.equal(isAnnouncementActiveAt(scheduled, now + 1), true);
  assert.equal(isAnnouncementActiveAt(scheduled, Date.parse('2026-11-12T05:00:00.000Z')), false);
});

test('التاريخ غير الصالح أو الفترة المعكوسة لا ينتجان إعلانًا نشطًا متذبذبًا', () => {
  assert.equal(isAnnouncementActiveAt(announcement({ starts_at: 'not-a-date' }), now), false);
  assert.equal(isAnnouncementActiveAt(announcement({ starts_at: '2026-11-12T05:00:00Z', ends_at: '2026-11-12T04:00:00Z' }), now), false);
});

test('الإعلانات تظهر فقط في الموضع المحفوظ، مع تعبئة العنوان والنص المختصر عند الحاجة', () => {
  const settings = config({
    display: { placement: 'top' },
    announcements: [announcement({ title: ' ', summary: '', message: 'النص البديل', display: { placement: 'after_hero' } })],
  });
  assert.equal(resolveNoticeAnnouncements(settings, 'top', now, false).length, 0);
  const afterHero = resolveNoticeAnnouncements(settings, 'after_hero', now, false);
  assert.equal(afterHero.length, 1);
  assert.equal(afterHero[0].title, '');
  assert.equal(afterHero[0].summary, 'النص البديل');
});

test('التنبيه القديم يظهر عند غياب إعلان نشط في موضعه فقط، مع حفظ نصه الأصلي', () => {
  const settings = config({
    display: { placement: 'top' },
    announcements: [announcement({ show_on_site: false })],
  });
  assert.equal(resolveNoticeAnnouncements(settings, 'after_hero', now, false).length, 0);
  const fallback = resolveNoticeAnnouncements(settings, 'top', now, true);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, 'legacy-notice');
  assert.equal(fallback[0].title, 'التنبيه القديم');
  assert.equal(fallback[0].summary, 'النص القديم يظل محفوظًا');
});

test('لا يظهر التنبيه القديم في المواضع الأخرى عند توفر حملة نشطة', () => {
  const settings = config({
    display: { placement: 'top' },
    announcements: [announcement()],
  });
  assert.equal(resolveNoticeAnnouncements(settings, 'after_hero', now, false).length, 0);
  assert.equal(resolveNoticeAnnouncements(settings, 'top', now, true).length, 1);
});

test('رابط الإعلان القديم أو الجديد يصلح لزر اضغط هنا', () => {
  const settings = config({ announcements: [announcement({ link_url: 'https://example.com' })] });
  assert.equal(resolveNoticeAnnouncements(settings, 'top', now, false)[0].link_url, 'https://example.com');
  const legacy = config({ announcements: [{ ...announcement(), link: '/appointments/new' } as NoticeAnnouncement & { link: string }] });
  assert.equal(resolveNoticeAnnouncements(legacy, 'top', now, false)[0].link_url, '/appointments/new');
});
