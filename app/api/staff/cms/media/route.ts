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
];
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
        { error: 'صيغة الملف غير مدعومة. الصيغ المسموحة: PNG, JPEG, WebP, SVG, ICO' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeBaseName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 30);
    const uniqueFilename = `${Date.now()}_${safeBaseName}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
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

