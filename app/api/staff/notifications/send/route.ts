import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { AuthService } from '@/services/authService';
import { createAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateImageUrl(value: unknown, request: NextRequest): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value, request.nextUrl.origin);
    const allowedHosts = new Set([request.nextUrl.hostname.toLowerCase()]);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) allowedHosts.add(new URL(supabaseUrl).hostname.toLowerCase());
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase()) || url.username || url.password) return null;
    if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function containsLikelyIdentifier(value: string): boolean {
  return /\b01[0125]\d{8}\b|\bBSCH-\d{4,10}\b|\b\d{14}\b/i.test(value);
}

export async function POST(request: NextRequest) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const staffUser = await AuthService.verifySession(token);
  if (!staffUser || staffUser.role !== 'ADMIN') {
    return NextResponse.json({ error: 'إرسال الإشعارات متاح لمدير النظام فقط.' }, { status: 403 });
  }
  const rate = await checkRateLimit(`webpush_broadcast_${staffUser.id}`, 5, 900);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'تم تجاوز عدد الإشعارات المسموح به مؤقتًا. حاول لاحقًا.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds || 60) } }
    );
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'https://bsch-clinic.com';
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'إعداد مفاتيح Web Push غير مكتمل على الخادم.' }, { status: 503 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'إعداد الوصول الآمن إلى Supabase غير مكتمل.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const message = typeof body?.body === 'string' ? body.body.trim() : '';
    const image = validateImageUrl(body?.imageUrl, request);

    if (title.length < 2 || title.length > 80 || message.length < 2 || message.length > 240) {
      return NextResponse.json({ error: 'اكتب عنوانًا من 2 إلى 80 حرفًا ونصًا من 2 إلى 240 حرفًا.' }, { status: 400 });
    }
    if (image === null) {
      return NextResponse.json({ error: 'رابط الصورة يجب أن يكون HTTPS من موقع المستشفى أو مخزن Supabase، وبصيغة صورة مدعومة.' }, { status: 400 });
    }
    if (containsLikelyIdentifier(`${title}\n${message}`)) {
      return NextResponse.json({ error: 'لا تضع أرقام هواتف أو أرقام حجز أو أرقامًا قومية في الإشعار. استخدم إعلانًا عامًا فقط.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: subscriptions, error } = await supabase
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .limit(5000);
    if (error) throw error;

    if (!subscriptions?.length) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, message: 'لا توجد أجهزة مشتركة في الإشعارات بعد.' });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify({ title, body: message, image, url: '/' });
    let sent = 0;
    let failed = 0;
    const staleEndpoints: string[] = [];

    for (let offset = 0; offset < subscriptions.length; offset += 25) {
      const batch = subscriptions.slice(offset, offset + 25);
      const results = await Promise.allSettled(batch.map(async (subscription) => {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 60 * 60, urgency: 'normal' }
        );
      }));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          sent += 1;
          return;
        }
        failed += 1;
        const statusCode = (result.reason as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(batch[index].endpoint);
        console.warn('Web Push delivery failed:', statusCode || 'unknown');
      });
    }

    if (staleEndpoints.length) {
      for (let offset = 0; offset < staleEndpoints.length; offset += 100) {
        const batch = staleEndpoints.slice(offset, offset + 100);
        await supabase.from('web_push_subscriptions').delete().in('endpoint', batch);
      }
    }

    return NextResponse.json({ success: true, sent, failed, removedExpired: staleEndpoints.length });
  } catch (error) {
    console.error('Web Push broadcast failed:', error);
    return NextResponse.json({ error: 'تعذر إرسال الإشعار إلى الأجهزة المشتركة.' }, { status: 500 });
  }
}
