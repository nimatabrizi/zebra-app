import { NextResponse } from 'next/server';
import {
  assertCallerIsUserAdmin,
  isAllowedAdminRole,
} from '../../../../../lib/adminGate';
import {
  generateEmailFromName,
  isNamedUserAdmin,
  normalizeWhatsappPassword,
  profilePilotFlagsForPerson,
  type AppRole,
} from '../../../../../lib/authIdentity';
import { createServiceClient } from '../../../../../utils/supabase/admin';
import { updateProfileRow } from '../../../../../lib/adminProfiles';
import { toConsultantPhotoSlug } from '../../../../../lib/formatName';
import { ownerRoleFromPilot } from '../../../../../lib/appointmentUtils';
import {
  PROFILE_DETAIL_KEYS,
  sanitizeProfileDetails,
  type ProfileDetailKey,
} from '../../../../../lib/profileFields';

export const runtime = 'nodejs';

type UpdateBody = {
  tam_isim?: string;
  whatsapp_number?: string;
  role?: string;
  unvan?: string | null;
} & Partial<Record<ProfileDetailKey, string | null>>;

type RouteContext = { params: Promise<{ id: string }> };

async function moveConsultantPhoto(
  admin: ReturnType<typeof createServiceClient>,
  oldName: string,
  newName: string
) {
  const oldSlug = toConsultantPhotoSlug(oldName);
  const newSlug = toConsultantPhotoSlug(newName);
  if (!oldSlug || !newSlug || oldSlug === newSlug) return;

  const bucket = 'consultant-photos';
  const fromPath = `${oldSlug}.png`;
  const toPath = `${newSlug}.png`;

  const { data: blob, error: dlErr } = await admin.storage
    .from(bucket)
    .download(fromPath);
  if (dlErr || !blob) return;

  const buffer = Buffer.from(await blob.arrayBuffer());
  await admin.storage.from(bucket).upload(toPath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  await admin.storage.from(bucket).remove([fromPath]);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Kullanıcı id gerekli' }, { status: 400 });
    }

    const body = (await request.json()) as UpdateBody;
    const admin = createServiceClient();
    let submittedProfileDetails: Record<string, string | null> = {};
    try {
      const sanitized = sanitizeProfileDetails(
        body as Record<string, unknown>
      );
      submittedProfileDetails = Object.fromEntries(
        PROFILE_DETAIL_KEYS.filter((key) =>
          Object.prototype.hasOwnProperty.call(body, key)
        ).map((key) => [key, sanitized[key]])
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Profil bilgileri geçersiz' },
        { status: 400 }
      );
    }

    const { data: existing, error: loadErr } = await admin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadErr || !existing) {
      return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
    }

    const existingRow = existing as Record<string, unknown>;
    const existingUnvan =
      existingRow.unvan != null
        ? String(existingRow.unvan)
        : existingRow.title != null
          ? String(existingRow.title)
          : null;

    const nextName = body.tam_isim !== undefined
      ? String(body.tam_isim).normalize('NFC').trim()
      : String(existingRow.tam_isim || '').trim();

    if (!nextName) {
      return NextResponse.json({ error: 'Tam isim zorunlu' }, { status: 400 });
    }

    const nextRoleRaw =
      body.role !== undefined
        ? String(body.role).trim()
        : String(existingRow.role || 'danisman');
    if (!isAllowedAdminRole(nextRoleRaw)) {
      return NextResponse.json({ error: 'Geçersiz rol' }, { status: 400 });
    }
    const flags = profilePilotFlagsForPerson(nextName, nextRoleRaw);
    const nextRole = flags.role as AppRole;

    const whatsappProvided =
      body.whatsapp_number !== undefined &&
      String(body.whatsapp_number).trim() !== '';
    const nextPassword = whatsappProvided
      ? normalizeWhatsappPassword(String(body.whatsapp_number))
      : '';

    if (whatsappProvided && (!nextPassword || nextPassword.length < 6)) {
      return NextResponse.json(
        {
          error:
            'Telefon numarası şifre için yetersiz (en az 6 rakam, örn. 5327650788)',
        },
        { status: 400 }
      );
    }

    const nameChanged =
      nextName.toLocaleLowerCase('tr-TR') !==
      String(existingRow.tam_isim || '')
        .trim()
        .toLocaleLowerCase('tr-TR');

    if (nameChanged) {
      const { data: clash } = await admin
        .from('profiles')
        .select('id, tam_isim')
        .ilike('tam_isim', nextName)
        .neq('id', id)
        .maybeSingle();
      if (clash) {
        return NextResponse.json(
          { error: `Bu isimde profil zaten var: ${clash.tam_isim}` },
          { status: 409 }
        );
      }
    }

    const email = generateEmailFromName(nextName);
    if (!email || email === '@zebra.local') {
      return NextResponse.json(
        { error: 'İsimden geçerli giriş e-postası üretilemedi' },
        { status: 400 }
      );
    }

    const authUpdate: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
    } = {
      user_metadata: {
        tam_isim: nextName,
        role: nextRole,
      },
    };
    if (nameChanged) authUpdate.email = email;
    if (whatsappProvided) authUpdate.password = nextPassword;

    const { error: authErr } = await admin.auth.admin.updateUserById(
      id,
      authUpdate
    );
    if (authErr) {
      return NextResponse.json(
        { error: authErr.message || 'Auth güncellenemedi' },
        { status: 500 }
      );
    }

    if (nameChanged) {
      await moveConsultantPhoto(
        admin,
        String(existingRow.tam_isim || ''),
        nextName
      );
    }

    const unvan =
      body.unvan !== undefined
        ? String(body.unvan || '').trim() || null
        : existingUnvan;

    const profilePatch: Record<string, unknown> = {
      tam_isim: nextName,
      role: nextRole,
      is_pilot: flags.is_pilot,
      ...submittedProfileDetails,
    };
    if (body.unvan !== undefined) {
      profilePatch.unvan = unvan;
    }
    if (whatsappProvided) {
      profilePatch.whatsapp_number = nextPassword;
    }

    let { error: profileErr } = await updateProfileRow(admin, id, profilePatch);

    // Canlı DB'de app_role henüz 'pilot' içermiyorsa: fatima/selim + is_pilot
    if (
      profileErr &&
      nextRole === 'pilot' &&
      /invalid input value for enum.*pilot/i.test(profileErr.message)
    ) {
      const existingRole = String(existingRow.role || '');
      const fallback =
        flags.legacyRole ||
        ownerRoleFromPilot(nextName) ||
        (existingRole === 'selim' || existingRole === 'fatima'
          ? existingRole
          : null);
      if (fallback) {
        profilePatch.role = fallback;
        profilePatch.is_pilot = true;
        ({ error: profileErr } = await updateProfileRow(admin, id, profilePatch));
      }
    }

    if (profileErr) {
      return NextResponse.json(
        { error: `Profil güncellenemedi: ${profileErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId: id,
      email,
      loginName: nextName,
      role: nextRole,
      passwordUpdated: whatsappProvided,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Kullanıcı güncellenemedi';
    console.error('admin/users PATCH:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Kullanıcı id gerekli' }, { status: 400 });
    }

    if (id === gate.user.id) {
      return NextResponse.json(
        { error: 'Kendi hesabınızı silemezsiniz' },
        { status: 400 }
      );
    }

    const admin = createServiceClient();
    const { data: existing } = await admin
      .from('profiles')
      .select('id, tam_isim')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
    }

    if (isNamedUserAdmin(existing.tam_isim)) {
      return NextResponse.json(
        { error: 'Korunan hesap silinemez' },
        { status: 400 }
      );
    }

    const slug = toConsultantPhotoSlug(existing.tam_isim);
    if (slug) {
      await admin.storage.from('consultant-photos').remove([`${slug}.png`]);
    }

    const { error: authDelErr } = await admin.auth.admin.deleteUser(id);
    // Yetim profil: Auth yoksa yine de profiles satırını sil
    const authMissing =
      !!authDelErr &&
      /user not found|not found/i.test(authDelErr.message || '');
    if (authDelErr && !authMissing) {
      return NextResponse.json(
        { error: authDelErr.message || 'Auth kullanıcısı silinemedi' },
        { status: 500 }
      );
    }

    const { error: profileDelErr } = await admin
      .from('profiles')
      .delete()
      .eq('id', id);

    if (profileDelErr) {
      return NextResponse.json(
        { error: `Profil silinemedi: ${profileDelErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      deletedName: existing.tam_isim,
      authDeleted: !authMissing,
      orphanProfile: authMissing,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Kullanıcı silinemedi';
    console.error('admin/users DELETE:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
