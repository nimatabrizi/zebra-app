import { NextResponse } from 'next/server';
import {
  assertCallerIsUserAdmin,
  isAllowedAdminRole,
} from '../../../../lib/adminGate';
import {
  generateEmailFromName,
  normalizeWhatsappPassword,
  profilePilotFlagsForPerson,
  type AppRole,
} from '../../../../lib/authIdentity';
import { createServiceClient } from '../../../../utils/supabase/admin';
import { upsertProfileRow } from '../../../../lib/adminProfiles';
import {
  sanitizeProfileDetails,
  type ProfileDetailKey,
} from '../../../../lib/profileFields';
import type { ProfileDetailValues } from '../../../../lib/profileFields';

export const runtime = 'nodejs';

type CreateUserBody = {
  tam_isim?: string;
  whatsapp_number?: string;
  role?: string;
  unvan?: string;
} & Partial<Record<ProfileDetailKey, string | null>>;

export async function POST(request: Request) {
  try {
    const gate = await assertCallerIsUserAdmin();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const body = (await request.json()) as CreateUserBody;
    const tamIsim = String(body.tam_isim || '')
      .normalize('NFC')
      .trim();
    const whatsappRaw = String(body.whatsapp_number || '').trim();
    const requestedRole = String(body.role || 'danisman').trim();
    const unvan = String(body.unvan || '').trim();
    let profileDetails: ProfileDetailValues;
    try {
      profileDetails = sanitizeProfileDetails(
        body as Record<string, unknown>
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Profil bilgileri geçersiz' },
        { status: 400 }
      );
    }

    if (!tamIsim) {
      return NextResponse.json(
        { error: 'Tam isim zorunlu' },
        { status: 400 }
      );
    }

    if (!isAllowedAdminRole(requestedRole)) {
      return NextResponse.json({ error: 'Geçersiz rol' }, { status: 400 });
    }

    const flags = profilePilotFlagsForPerson(tamIsim, requestedRole);
    const role = flags.role as AppRole;

    const email = generateEmailFromName(tamIsim);
    const password = normalizeWhatsappPassword(whatsappRaw);

    if (!email || email === '@zebra.local') {
      return NextResponse.json(
        { error: 'İsimden geçerli giriş e-postası üretilemedi' },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        {
          error:
            'Telefon numarası şifre için yetersiz (en az 6 rakam, örn. 5327650788)',
        },
        { status: 400 }
      );
    }

    const admin = createServiceClient();

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, tam_isim')
      .ilike('tam_isim', tamIsim)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: `Bu isimde profil zaten var: ${existingProfile.tam_isim}` },
        { status: 409 }
      );
    }

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          tam_isim: tamIsim,
          role,
        },
      });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || 'Auth kullanıcısı oluşturulamadı' },
        { status: 500 }
      );
    }

    const userId = created.user.id;

    const profileRow: Record<string, unknown> = {
      id: userId,
      tam_isim: tamIsim,
      role,
      is_pilot: flags.is_pilot,
      whatsapp_number: password,
      ...profileDetails,
    };
    if (unvan) profileRow.unvan = unvan;

    let { error: profileInsertError } = await upsertProfileRow(
      admin,
      profileRow
    );

    if (
      profileInsertError &&
      role === 'pilot' &&
      flags.legacyRole &&
      /invalid input value for enum.*pilot/i.test(profileInsertError.message)
    ) {
      profileRow.role = flags.legacyRole;
      profileRow.is_pilot = true;
      ({ error: profileInsertError } = await upsertProfileRow(
        admin,
        profileRow
      ));
    }

    if (profileInsertError) {
      return NextResponse.json(
        {
          error: `Auth oluşturuldu ama profil yazılamadı: ${profileInsertError.message}`,
          userId,
          email,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      email,
      loginName: tamIsim,
      loginPasswordHint: password,
      role,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı';
    console.error('create-user:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
