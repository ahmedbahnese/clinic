import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supportedEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com'
      || host === 'web.push.apple.com'
      || host === 'notify.windows.com'
      || host.endsWith('.notify.windows.com')
      || host === 'push.services.mozilla.com'
      || host.endsWith('.push.services.mozilla.com');
  } catch {
    return false;
  }
}

function validKey(value: unknown, minimum: number): value is string {
  return typeof value === 'string' && value.length >= minimum && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

function unavailable() {
  return NextResponse.json({ error: 'تعذر الاتصال بمخزن الاشتراكات الآمن.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = (request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown').slice(0, 100);
    const rate = await checkRateLimit(`webpush_subscribe_${clientIp}`, 10, 3600);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز عدد محاولات الاشتراك المسموح بها. حاول لاحقًا.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds || 60) } }
      );
    }
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 12_000) return NextResponse.json({ error: 'بيانات الاشتراك كبيرة جدًا.' }, { status: 413 });
    const body = await request.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!supportedEndpoint(endpoint) || !validKey(p256dh, 40) || !validKey(auth, 8)) {
      return NextResponse.json({ error: 'بيانات اشتراك الإشعارات غير صالحة.' }, { status: 400 });
    }
    if (!isSupabaseAdminConfigured()) return unavailable();

    const supabase = createAdminClient();
    const { error } = await supabase.from('web_push_subscriptions').upsert(
      { endpoint, p256dh, auth, updated_at: new Date().toISOString() },
      { onConflict: 'endpoint' }
    );
    if (error) {
      console.error('Could not persist Web Push subscription:', error.message);
      return unavailable();
    }

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Web Push subscription request failed:', error);
    return NextResponse.json({ error: 'تعذر حفظ الاشتراك الآن.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint = body?.endpoint;
    if (!supportedEndpoint(endpoint)) return NextResponse.json({ error: 'عنوان الاشتراك غير صالح.' }, { status: 400 });
    if (!isSupabaseAdminConfigured()) return unavailable();

    const supabase = createAdminClient();
    const { error } = await supabase.from('web_push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) {
      console.error('Could not remove Web Push subscription:', error.message);
      return unavailable();
    }
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Web Push unsubscribe request failed:', error);
    return NextResponse.json({ error: 'تعذر إلغاء الاشتراك الآن.' }, { status: 500 });
  }
}
