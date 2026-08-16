import { NextResponse } from 'next/server';
import { assertCallerIsUserAdmin } from '../../../../../../lib/adminGate';
import { createServiceClient } from '../../../../../../utils/supabase/admin';
import { toConsultantPhotoSlug } from '../../../../../../lib/formatName';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Kullanıcı id gerekli' }, { status: 400 });
    }

    const admin = createServiceClient();
    const { data: profile, error: loadErr } = await admin
      .from('profiles')
      .select('id, tam_isim')
      .eq('id', id)
      .maybeSingle();

    if (loadErr || !profile) {
      return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
    }

    const slug = toConsultantPhotoSlug(profile.tam_isim);
    if (!slug) {
      return NextResponse.json(
        { error: 'İsimden fotoğraf dosya adı üretilemedi' },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'photo alanı (dosya) zorunlu' },
        { status: 400 }
      );
    }

    const type = file.type || '';
    if (!type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Yalnızca görsel dosyası yükleyin' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Dosya 8 MB’dan büyük olamaz' },
        { status: 400 }
      );
    }

    const path = `${slug}.png`;
    const { error: upErr } = await admin.storage
      .from('consultant-photos')
      .upload(path, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message || 'Fotoğraf yüklenemedi' },
        { status: 500 }
      );
    }

    const { data: pub } = admin.storage
      .from('consultant-photos')
      .getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      path,
      photoUrl: `${pub.publicUrl}?t=${Date.now()}`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Fotoğraf yüklenemedi';
    console.error('admin/users photo:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
