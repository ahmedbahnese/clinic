import { NextRequest, NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';
import { AuthService } from '@/services/authService';
import { createAdminClient, createUserClient, isSupabaseConfigured, isSupabaseAdminConfigured } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient(token?: string) {
  if (token && token.trim()) {
    try {
      return createUserClient(token);
    } catch {}
  }
  if (isSupabaseAdminConfigured()) {
    try {
      return createAdminClient();
    } catch {}
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  return createClient(url, anonKey);
}
import type { MediaAsset } from '@/types/cms';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'application/pdf',
];
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'application/pdf': 'pdf',
};
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'غير مصرح بعرض مكتبة الوسائط.' }, { status: 403 });
    }

    const data = await cmsService.getCmsDashboardData(token);
    return NextResponse.json({ success: true, assets: data.assets });
  } catch (error) {
    console.error('Error fetching media assets:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب الوسائط' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);

    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح برفع الوسائط. صلاحية مدير النظام مطلوبة.' },
        { status: 403 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    // Case 1: Register existing asset via JSON
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      if (!body.url || !body.name) {
        return NextResponse.json({ error: 'اسم الصورة ورابطها مطلوبان' }, { status: 400 });
      }

      const asset: MediaAsset = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: body.name.trim(),
        url: body.url.trim(),
        mime_type: body.mime_type || 'image/png',
        size_bytes: body.size_bytes || 0,
        alt_text: body.alt_text?.trim() || body.name.trim(),
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        try {
          const supabase = getSupabaseClient(token);
          await (supabase.from('media_assets') as any).upsert({
            id: asset.id,
            name: asset.name,
            url: asset.url,
            mime_type: asset.mime_type,
            size_bytes: asset.size_bytes || 0,
            alt_text: asset.alt_text || null,
            storage_path: null,
            bucket_id: null,
            is_custom: true,
            created_at: asset.created_at,
            updated_at: new Date().toISOString(),
            created_by: staffUser.username || staffUser.name || 'admin',
          });
        } catch (dbErr) {
          console.warn('Failed to persist registered media asset in Supabase:', dbErr);
        }
      }

      cmsService.registerCustomAsset(asset);
      return NextResponse.json({ success: true, asset, message: 'تم تسجيل الصورة في المكتبة بنجاح' });
    }

    // Case 2: File Upload via multipart/form-data
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'نوع الطلب غير مدعوم' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const customName = (formData.get('name') as string | null)?.trim();
    const customAlt = (formData.get('alt_text') as string | null)?.trim();

    if (!file) {
      return NextResponse.json({ error: 'لم يتم إرسال أي ملف' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'حجم الملف يتجاوز الحد المسموح به (5 ميجابايت)' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'صيغة الملف غير مدعومة. الصيغ المسموحة: PNG, JPEG, WebP, SVG, ICO, PDF' },
        { status: 400 }
      );
    }

    const ext = EXTENSION_BY_MIME[file.type];
    const safeBaseName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 30);
    const uniqueFilename = `${Date.now()}_${safeBaseName}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.type === 'application/pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return NextResponse.json({ error: 'محتوى ملف PDF غير صالح.' }, { status: 400 });
    }
    let publicUrl = '';

    // Attempt Supabase storage first if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient(token);
        const { error: uploadError } = await supabase.storage
          .from('public-cms-assets')
          .upload(`uploads/${uniqueFilename}`, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('public-cms-assets')
            .getPublicUrl(`uploads/${uniqueFilename}`);
          publicUrl = urlData.publicUrl;
        } else {
          console.warn('Supabase storage upload failed, saving to local disk:', uploadError.message);
        }
      } catch (err) {
        console.warn('Supabase storage exception, falling back to local:', err);
      }
    }

    // Fallback: save to public/uploads/cms locally
    if (!publicUrl) {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'cms');
      await fs.mkdir(uploadDir, { recursive: true });
      const localFilePath = path.join(uploadDir, uniqueFilename);
      await fs.writeFile(localFilePath, buffer);
      publicUrl = `/uploads/cms/${uniqueFilename}`;
    }

    const asset: MediaAsset = {
      id: `asset_${Date.now()}`,
      name: customName || file.name,
      url: publicUrl,
      mime_type: file.type,
      size_bytes: file.size,
      alt_text: customAlt || customName || file.name,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient(token);
        await (supabase.from('media_assets') as any).upsert({
          id: asset.id,
          name: asset.name,
          url: asset.url,
          mime_type: asset.mime_type,
          size_bytes: asset.size_bytes || 0,
          alt_text: asset.alt_text || null,
          storage_path: `uploads/${uniqueFilename}`,
          bucket_id: publicUrl.includes('public-cms-assets') ? 'public-cms-assets' : null,
          is_custom: true,
          created_at: asset.created_at,
          updated_at: new Date().toISOString(),
          created_by: staffUser.username || staffUser.name || 'admin',
        });
      } catch (dbErr) {
        console.warn('Failed to persist uploaded media asset in Supabase:', dbErr);
      }
    }

    cmsService.registerCustomAsset(asset);

    return NextResponse.json({
      success: true,
      message: 'تم رفع الصورة وإضافتها إلى مكتبة الوسائط بنجاح',
      asset,
    });
  } catch (error) {
    console.error('Error handling media upload:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء رفع الملف' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const staffUser = await AuthService.verifySession(token);
    if (!staffUser || staffUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'غير مصرح بحذف الوسائط. صلاحية مدير النظام مطلوبة.' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const assetId = String(body.id || '').trim();
    if (!assetId) return NextResponse.json({ error: 'معرّف الوسيط مطلوب' }, { status: 400 });
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'خدمة التخزين المركزية غير متصلة، لم يتم حذف الملف.' }, { status: 503 });

    const supabase: any = getSupabaseClient(token);
    const { data: asset, error: assetError } = await supabase.from('media_assets').select('*').eq('id', assetId).maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return NextResponse.json({ error: 'الوسيط غير موجود أو لا يمكن حذفه.' }, { status: 404 });
    if (asset.is_custom === false) return NextResponse.json({ error: 'الوسائط الأساسية للنظام لا يمكن حذفها.' }, { status: 409 });

    const { data: settings } = await supabase.from('website_settings').select('header_logo_url,footer_logo_url,favicon_url,og_image_url,notice_bar').eq('id', 'default').maybeSingle();
    const { data: sections } = await supabase.from('homepage_sections').select('id,content').limit(100);
    const references: string[] = [];
    if (settings) {
      if (settings.header_logo_url === asset.url) references.push('شعار الرأس');
      if (settings.footer_logo_url === asset.url) references.push('شعار التذييل');
      if (settings.favicon_url === asset.url) references.push('أيقونة المتصفح');
      if (settings.og_image_url === asset.url) references.push('صورة المشاركة العامة');
      if (Array.isArray(settings.notice_bar?.announcements) && settings.notice_bar.announcements.some((x: any) => x.image_url === asset.url)) references.push('إعلان أو تنبيه');
    }
    for (const section of sections || []) {
      if (JSON.stringify(section.content || {}).includes(asset.url)) references.push(`قسم الصفحة الرئيسية: ${section.id}`);
    }
    if (references.length > 0) return NextResponse.json({ error: 'لا يمكن حذف الصورة لأنها مستخدمة في النظام.', references: [...new Set(references)] }, { status: 409 });

    if (asset.storage_path && asset.bucket_id) {
      const { error: storageError } = await supabase.storage.from(asset.bucket_id).remove([asset.storage_path]);
      if (storageError) return NextResponse.json({ error: 'تعذر حذف الملف الفعلي من التخزين، ولم يتم حذف السجل.', details: storageError.message }, { status: 502 });
    } else if (typeof asset.url === 'string' && asset.url.startsWith('/uploads/cms/')) {
      const localFile = path.join(process.cwd(), 'public', asset.url.replace(/^\//, ''));
      try {
        await fs.unlink(localFile);
      } catch (localError: any) {
        return NextResponse.json({ error: 'تعذر حذف الملف المحلي الفعلي، ولم يتم حذف السجل.', details: localError?.message }, { status: 502 });
      }
    } else {
      return NextResponse.json({ error: 'هذا الوسيط مرتبط برابط خارجي ولا يملك النظام ملفًا فعليًا يمكن حذفه بأمان.' }, { status: 409 });
    }
    const { error: deleteError } = await supabase.from('media_assets').delete().eq('id', assetId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true, message: 'تم حذف الوسيط والملف الفعلي من التخزين.' });
  } catch (error: any) {
    console.error('Error deleting media asset:', error);
    return NextResponse.json({ error: 'حدث خطأ في الخادم أثناء حذف الوسيط' }, { status: 500 });
  }
}
