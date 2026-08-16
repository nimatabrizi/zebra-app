'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import { getFontEmbedCSS, toPng } from 'html-to-image';
import {
  ChevronDown,
  Download,
  Eye,
  ImagePlus,
  Loader2,
  Move,
  RectangleVertical,
  RefreshCcw,
  Square,
  User,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { usesManagerShell } from '../lib/authIdentity';
import { toTurkishUpper } from '../lib/formatName';
import {
  SOCIAL_STUDIO_CANVAS,
  formatStudioPhone,
  resolveConsultantPhotoUrl,
  studioFontEmbedCSS,
  toStudioDisplayName,
  waitForStudioFonts,
  type StudioFormat,
} from '../lib/studioAssets';
import {
  DEFAULT_CONSULTANT_TITLE,
  resolveConsultantTitle,
} from '../lib/consultantTitles';

type ProfileFields = {
  name: string;
  rawName: string;
  title: string;
  phone: string;
};

type ConsultantOption = ProfileFields & {
  id: string;
  photoUrl: string | null;
};

type ZebraStudioProps = {
  userId: string;
  fallbackName?: string;
  role?: string;
  /** Görseli indirmek yerine başka bir stüdyoya kaynak olarak aktarır. */
  onImageReady?: (format: StudioFormat, blob: Blob) => void | Promise<void>;
  embedded?: boolean;
  /** Satıldı/Kiralandı kaynak üretiminde isimsiz varyasyonları gizler. */
  namedOnly?: boolean;
  /** Canlı tuvali başka bir panele taşır; form tek sütun kalır. */
  canvasPortalTarget?: HTMLElement | null;
  /** Tuvalin üzerine binen katman (durum animasyonu). Dışa aktarıma girmez. */
  canvasOverlay?: React.ReactNode;
  /** Tuval kartındaki başlık, kimlik seçimi ve PNG indirmeleri gizler. */
  canvasChromeless?: boolean;
  /** Formatı dışarıdan yönetir (durum videosu Post/Story sekmesi). */
  formatOverride?: StudioFormat;
  /** Tuvali PNG olarak yakalayan fonksiyonu üst bileşene verir. */
  onCaptureReady?: (
    capture: ((format: StudioFormat) => Promise<Blob>) | null
  ) => void;
  /** İsimli çıktı için gereken alanlar hazır olduğunda bildirir. */
  onDesignReadyChange?: (ready: boolean) => void;
};

type IdentityMode = 'named' | 'anonymous';
type PortfolioTransform = { x: number; y: number; zoom: number };
type ExportSpec = { format: StudioFormat; identity: IdentityMode };

const DEFAULT_TITLE = DEFAULT_CONSULTANT_TITLE;
const EMPTY_PROFILE: ProfileFields = {
  name: '',
  rawName: '',
  title: DEFAULT_TITLE,
  phone: '',
};

const FIXED_ASSETS = {
  logo: '/templates/social-cb360-logo.png',
  legal: '/templates/social-legal.png',
  motto: '/templates/social-motto.png',
} as const;

function pickProfileFields(row: Record<string, unknown> | null): ProfileFields {
  if (!row) return EMPTY_PROFILE;
  const rawName = String(row.tam_isim ?? row.full_name ?? '')
    .normalize('NFC')
    .trim();
  return {
    name: toStudioDisplayName(rawName),
    rawName,
    title: resolveConsultantTitle(
      rawName,
      (row.unvan ?? row.title ?? row.job_title ?? row.pozisyon) as
        | string
        | null
        | undefined
    ),
    phone: formatStudioPhone(
      row.whatsapp_number ?? row.telefon ?? row.phone ?? row.tel ?? ''
    ),
  };
}

function safeFilePart(value: string): string {
  return String(value || 'zebra')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-ğüşıöç]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function inlineNodeImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll('img'));
  const backups = imgs.map((img) => ({
    img,
    src: img.getAttribute('src'),
    crossOrigin: img.getAttribute('crossorigin'),
  }));

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith('data:')) {
        await img.decode().catch(() => undefined);
        return;
      }
      try {
        const response = await fetch(src, { mode: 'cors', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(reader.error || new Error('FileReader'));
          reader.readAsDataURL(blob);
        });
        img.removeAttribute('crossorigin');
        img.src = dataUrl;
        await img.decode().catch(() => undefined);
      } catch (error) {
        console.warn('Zebra Studio görseli gömülemedi:', src, error);
      }
    })
  );

  return () => {
    for (const { img, src, crossOrigin } of backups) {
      if (src == null) img.removeAttribute('src');
      else img.setAttribute('src', src);
      if (crossOrigin == null) img.removeAttribute('crossorigin');
      else img.setAttribute('crossorigin', crossOrigin);
    }
  };
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hedef verilmişse içeriği o konteynere taşır, yoksa yerinde bırakır. */
function MaybePortal({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: React.ReactNode;
}) {
  if (!target) return <>{children}</>;
  return createPortal(children, target);
}

/** Sunucu render'ında portal kurulmasın diye istemci kontrolü. */
const subscribeNoop = () => () => {};

/**
 * Tam ekran katmanını body'ye taşır; aksi halde `backdrop-filter` kullanan
 * üst kartlar `position: fixed` için içerme bloğu oluşturup katmanı kırpıyor.
 */
function PortalWhen({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  if (!active || !mounted) return <>{children}</>;
  return createPortal(children, document.body);
}

function IdentityLayer({
  format,
  partnership,
  profile,
  photoSrc,
  side,
  failed,
  onError,
}: {
  format: StudioFormat;
  partnership: boolean;
  profile: ProfileFields;
  photoSrc: string | null;
  side: 'left' | 'right';
  failed: boolean;
  onError: () => void;
}) {
  const post = format === 'post';
  const portraitHeight = post
    ? partnership
      ? 455
      : 525
    : partnership
      ? 605
      : 690;
  const portraitWidth = partnership
    ? post
      ? 455
      : 525
    : post
      ? 560
      : 610;
  const legalHeight = post ? 82 : 105;
  // Daha aşağıda: footer çizgisine yaklaşır
  const textBottom = legalHeight + (post ? 28 : 34);
  const identityFontSize = post
    ? partnership
      ? 40
      : 46
    : partnership
      ? 42
      : 48;
  const titleFontSize = post ? 16 : 18;
  // Unvan ↔ isim ve unvan ↔ telefon arası eşit boşluk
  const titleGap = post ? 10 : 12;
  const right = side === 'right';
  // object-contain kutuyu ortalar; köşeye dayamak için kutuyu tuvalin dışına taşır
  const edgeOffset = partnership ? (post ? -70 : -80) : post ? -70 : -55;

  return (
    <>
      <div
        className="absolute z-[4] pointer-events-none"
        style={{
          width: portraitWidth,
          height: portraitHeight,
          // Yatay beyaz çizginin (footer üst kenarı) tam üstünde bitsin
          bottom: legalHeight,
          left: right ? undefined : edgeOffset,
          right: right ? edgeOffset : undefined,
          overflow: 'hidden',
        }}
      >
        {photoSrc && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-contain object-bottom"
            style={{
              transform: `scale(${partnership ? 1.05 : 1.08})`,
              transformOrigin: 'bottom center',
            }}
            draggable={false}
            onError={onError}
          />
        ) : null}

        {photoSrc && !failed ? (
          // Radial: kutu kenarlarında iz bırakmadan görselin altını koyulaştırır
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 78% 58% at 50% 100%, rgba(3,10,22,.92) 0%, rgba(5,14,30,.72) 38%, rgba(7,18,36,.34) 62%, rgba(8,20,40,0) 82%)',
            }}
          />
        ) : null}

        {!photoSrc || failed ? (
          <div
            className={`absolute bottom-0 ${
              right ? 'right-10' : 'left-10'
            } rounded-t-[42%] bg-gradient-to-b from-white/15 to-black/30 border border-white/10 flex items-center justify-center`}
            style={{
              width: portraitWidth * 0.65,
              height: portraitHeight * 0.86,
            }}
          >
            <User
              className="text-white/30"
              style={{
                width: portraitWidth * 0.25,
                height: portraitWidth * 0.25,
              }}
              strokeWidth={1.1}
            />
          </div>
        ) : null}
      </div>

      <div
        className={`absolute z-[6] pointer-events-none ${
          right ? 'text-right' : 'text-left'
        }`}
        style={{
          bottom: textBottom,
          left: right ? undefined : post ? 60 : 55,
          right: right ? (post ? 60 : 55) : undefined,
          width: partnership ? (post ? 455 : 475) : post ? 540 : 580,
          textShadow:
            '0 3px 2px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.85)',
        }}
      >
        <p
          className="text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis"
          style={{
            fontFamily: 'var(--font-oswald), sans-serif',
            fontSize: identityFontSize,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {toTurkishUpper(profile.name)}
        </p>
        <p
          className="text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis"
          style={{
            fontFamily: 'var(--font-zalando-expanded)',
            fontSize: titleFontSize,
            fontWeight: 600,
            letterSpacing: '0.015em',
            marginTop: titleGap,
          }}
        >
          {toTurkishUpper(profile.title || DEFAULT_TITLE)}
        </p>
        {profile.phone ? (
          <p
            className="text-white leading-none tabular-nums whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-oswald), sans-serif',
              fontSize: identityFontSize,
              fontWeight: 700,
              letterSpacing: '0.01em',
              marginTop: titleGap,
            }}
          >
            {profile.phone}
          </p>
        ) : null}
      </div>
    </>
  );
}

export default function ZebraStudio({
  userId,
  fallbackName = '',
  role = '',
  onImageReady,
  embedded = false,
  namedOnly = false,
  canvasPortalTarget = null,
  canvasOverlay = null,
  canvasChromeless = false,
  formatOverride,
  onCaptureReady,
  onDesignReadyChange,
}: ZebraStudioProps) {
  const isManager = usesManagerShell(role);
  const [format, setFormat] = useState<StudioFormat>('post');
  const [identityMode, setIdentityMode] = useState<IdentityMode>('named');
  const [partnership, setPartnership] = useState(false);
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [description, setDescription] = useState('');
  const [portfolioPreview, setPortfolioPreview] = useState<string | null>(null);
  const [portfolioTransform, setPortfolioTransform] =
    useState<PortfolioTransform>({ x: 0, y: 0, zoom: 1.15 });

  const [profile, setProfile] = useState<ProfileFields>(() =>
    isManager
      ? EMPTY_PROFILE
      : {
          ...EMPTY_PROFILE,
          name: toStudioDisplayName(fallbackName),
          rawName: fallbackName,
        }
  );
  const [partner, setPartner] = useState<ProfileFields>(EMPTY_PROFILE);
  const [consultants, setConsultants] = useState<ConsultantOption[]>([]);
  const [selectedConsultantId, setSelectedConsultantId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [photoSlugs, setPhotoSlugs] = useState<string[]>([]);
  const [brokenPhoto, setBrokenPhoto] = useState('');
  const [brokenPartnerPhoto, setBrokenPartnerPhoto] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(0.35);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const selectedConsultantIdRef = useRef('');
  const selectedPartnerIdRef = useRef('');
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    selectedConsultantIdRef.current = selectedConsultantId;
    selectedPartnerIdRef.current = selectedPartnerId;
  }, [selectedConsultantId, selectedPartnerId]);

  const canvasSize = SOCIAL_STUDIO_CANVAS[format];
  const post = format === 'post';
  const photoInventory = photoSlugs.length > 0 ? photoSlugs : null;
  const consultantSrc = useMemo(() => {
    if (!profile.rawName && !profile.name) return null;
    return resolveConsultantPhotoUrl(
      profile.rawName || profile.name,
      photoInventory
    );
  }, [profile, photoInventory]);
  const partnerSrc = useMemo(() => {
    if (!partner.rawName && !partner.name) return null;
    return resolveConsultantPhotoUrl(
      partner.rawName || partner.name,
      photoInventory
    );
  }, [partner, photoInventory]);

  useEffect(() => {
    let cancelled = false;
    const loadInventory = async () => {
      const { data, error } = await supabase.storage
        .from('consultant-photos')
        .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      if (cancelled) return;
      if (error) {
        console.warn('consultant-photos listelenemedi:', error.message);
        return;
      }
      setPhotoSlugs(
        (data || [])
          .map((file) => String(file.name || '').replace(/\.png$/i, ''))
          .filter(Boolean)
      );
    };
    void loadInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProfiles = async () => {
      setProfileLoading(true);
      const [{ data: own, error: ownError }, { data: all, error: listError }] =
        await Promise.all([
          userId
            ? supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from('profiles').select('*').order('tam_isim', {
            ascending: true,
          }),
        ]);
      if (cancelled) return;

      const inventory = photoSlugs.length > 0 ? photoSlugs : null;

      if (listError) {
        console.error('Zebra Studio danışman listesi hatası:', listError.message);
        setConsultants([]);
      } else {
        const allowedRoles = new Set([
          'danisman',
          'broker',
          'pilot',
          'fatima',
          'selim',
        ]);
        const list = (all || [])
          .filter((row) =>
            allowedRoles.has(
              String((row as Record<string, unknown>).role || '')
                .trim()
                .toLocaleLowerCase('tr-TR')
            )
          )
          .map((row) => {
            const fields = pickProfileFields(row as Record<string, unknown>);
            return {
              id: String((row as { id?: string }).id || fields.rawName),
              ...fields,
              photoUrl: resolveConsultantPhotoUrl(
                fields.rawName || fields.name,
                inventory
              ),
            } satisfies ConsultantOption;
          })
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
        setConsultants(list);

        if (!isManager && userId) {
          const self =
            list.find((item) => item.id === userId) ||
            (own
              ? {
                  id: userId,
                  ...pickProfileFields(own as Record<string, unknown>),
                  photoUrl: null as string | null,
                }
              : null);
          if (self?.name) {
            setSelectedConsultantId(self.id);
            setProfile({
              name: self.name,
              rawName: self.rawName,
              title: self.title,
              phone: self.phone,
            });
            setBrokenPhoto('');
          } else {
            if (ownError) {
              console.error('Zebra Studio profil yüklenemedi:', ownError.message);
            }
            setProfile({
              ...EMPTY_PROFILE,
              name: toStudioDisplayName(fallbackName),
              rawName: fallbackName,
            });
          }
        } else if (isManager) {
          const primaryId = selectedConsultantIdRef.current;
          const partnerId = selectedPartnerIdRef.current;
          if (primaryId) {
            const matched = list.find((item) => item.id === primaryId);
            if (matched) {
              setProfile({
                name: matched.name,
                rawName: matched.rawName,
                title: matched.title,
                phone: matched.phone,
              });
              setBrokenPhoto('');
            }
          }
          if (partnerId) {
            const matched = list.find((item) => item.id === partnerId);
            if (matched) {
              setPartner({
                name: matched.name,
                rawName: matched.rawName,
                title: matched.title,
                phone: matched.phone,
              });
              setBrokenPartnerPhoto('');
            }
          }
        }
      }
      setProfileLoading(false);
    };
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [userId, fallbackName, isManager, photoSlugs]);

  /**
   * Ölçek, tuvalin içinde durduğu alandan hesaplanır. Çerçevenin kendisi
   * ölçeğe göre boyutlandığı için ölçüm alan elemanından yapılmalı.
   */
  const updatePreviewScale = useCallback(() => {
    if (typeof window === 'undefined') return;
    const area = previewAreaRef.current;
    if (!area) return;
    const styles = window.getComputedStyle(area);
    const paddingX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = area.clientWidth - paddingX;
    if (availableWidth <= 0) return;

    if (fullscreenPreview) {
      const availableHeight = area.clientHeight - paddingY;
      if (availableHeight <= 0) return;
      setPreviewScale(
        Math.min(
          1,
          availableWidth / canvasSize.width,
          availableHeight / canvasSize.height
        )
      );
      return;
    }

    let scale = Math.min(1, availableWidth / canvasSize.width);
    if (window.innerWidth < 1024) {
      const maxHeight = Math.min(window.innerHeight * 0.54, 560);
      scale = Math.min(scale, maxHeight / canvasSize.height);
    }
    setPreviewScale(scale);
  }, [canvasSize, fullscreenPreview]);

  useLayoutEffect(() => {
    const area = previewAreaRef.current;
    const resize = () => updatePreviewScale();
    resize();
    const raf = window.requestAnimationFrame(resize);
    window.addEventListener('resize', resize);
    const observer =
      area && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(resize)
        : null;
    observer?.observe(area as Element);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [updatePreviewScale, format, fullscreenPreview]);

  useEffect(() => {
    if (!fullscreenPreview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenPreview(false);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [fullscreenPreview]);

  const selectProfile = (id: string, target: 'primary' | 'partner') => {
    const selected = consultants.find((item) => item.id === id);
    if (target === 'primary') {
      setSelectedConsultantId(id);
      setProfile(selected || EMPTY_PROFILE);
      setBrokenPhoto('');
      if (id && id === selectedPartnerId) {
        setSelectedPartnerId('');
        setPartner(EMPTY_PROFILE);
      }
    } else {
      setSelectedPartnerId(id);
      setPartner(selected || EMPTY_PROFILE);
      setBrokenPartnerPhoto('');
    }
  };

  const onPortfolioFile = (file: File | null) => {
    if (!file) {
      setPortfolioPreview(null);
      setPortfolioTransform({ x: 0, y: 0, zoom: 1.15 });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPortfolioPreview(
        typeof reader.result === 'string' ? reader.result : null
      );
      setPortfolioTransform({ x: 0, y: 0, zoom: 1.15 });
    };
    reader.onerror = () => setPortfolioPreview(null);
    reader.readAsDataURL(file);
  };

  const onPortfolioPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!portfolioPreview || exporting) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startX: portfolioTransform.x,
      startY: portfolioTransform.y,
    };
  };

  const onPortfolioPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxX = (canvasSize.width * (portfolioTransform.zoom - 1)) / 2;
    const maxY = (canvasSize.height * (portfolioTransform.zoom - 1)) / 2;
    const dx = (event.clientX - drag.clientX) / previewScale;
    const dy = (event.clientY - drag.clientY) / previewScale;
    setPortfolioTransform((current) => ({
      ...current,
      x:
        maxX > 0
          ? Math.max(-1, Math.min(1, drag.startX + dx / maxX))
          : 0,
      y:
        maxY > 0
          ? Math.max(-1, Math.min(1, drag.startY + dy / maxY))
          : 0,
    }));
  };

  const stopPortfolioDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const captureSpec = async (spec: ExportSpec): Promise<Blob> => {
    const node = canvasRef.current;
    if (!node) throw new Error('Tuval bulunamadı');

    flushSync(() => {
      setFormat(spec.format);
      setIdentityMode(spec.identity);
    });
    await waitForStudioFonts();
    await waitForPaint();
    const extraFontCSS = await studioFontEmbedCSS();
    const restoreImages = await inlineNodeImages(node);
    try {
      const size = SOCIAL_STUDIO_CANVAS[spec.format];
      const baseFontCSS = await getFontEmbedCSS(node);
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 1,
        width: size.width,
        height: size.height,
        skipFonts: false,
        fontEmbedCSS: `${baseFontCSS}\n${extraFontCSS}`,
        style: {
          transform: 'none',
          width: `${size.width}px`,
          height: `${size.height}px`,
        },
      });
      if (!dataUrl || dataUrl === 'data:,') {
        throw new Error(`${size.label} görseli üretilemedi`);
      }
      return await (await fetch(dataUrl)).blob();
    } finally {
      restoreImages();
    }
  };

  const fileBase = useMemo(() => {
    if (!profile.name) return 'zebra';
    return partnership && partner.name
      ? `${safeFilePart(profile.name)}-${safeFilePart(partner.name)}`
      : safeFilePart(profile.name);
  }, [profile.name, partner.name, partnership]);

  const canNamedExport =
    Boolean(profile.name) && (!partnership || Boolean(partner.name));

  // Dış format yalnızca değiştiği anda uygulanır; yakalama sırasındaki geçici
  // format değişimlerini ezmemesi için render sırasında senkronlanır.
  const [appliedFormatOverride, setAppliedFormatOverride] =
    useState(formatOverride);
  if (formatOverride && formatOverride !== appliedFormatOverride) {
    setAppliedFormatOverride(formatOverride);
    setFormat(formatOverride);
  }

  // captureSpec her render'da yeniden kurulur; dışarıya sabit bir sarmalayıcı ver.
  const captureSpecRef = useRef(captureSpec);
  const restoreStateRef = useRef({ format, identity: identityMode });
  useEffect(() => {
    captureSpecRef.current = captureSpec;
    restoreStateRef.current = { format, identity: identityMode };
  });

  useEffect(() => {
    if (!onCaptureReady) return;
    const capture = async (target: StudioFormat) => {
      const previous = restoreStateRef.current;
      try {
        return await captureSpecRef.current({
          format: target,
          identity: 'named',
        });
      } finally {
        flushSync(() => {
          setFormat(previous.format);
          setIdentityMode(previous.identity);
        });
      }
    };
    onCaptureReady(capture);
    return () => onCaptureReady(null);
  }, [onCaptureReady]);

  useEffect(() => {
    onDesignReadyChange?.(Boolean(portfolioPreview) && canNamedExport);
  }, [portfolioPreview, canNamedExport, onDesignReadyChange]);

  const handleSingleDownload = async (spec: ExportSpec) => {
    if (exporting) return;
    if (spec.identity === 'named' && !canNamedExport) {
      window.alert(
        partnership
          ? 'İsimli ortak tasarım için iki danışman seçin.'
          : 'İsimli tasarım için danışman seçin.'
      );
      return;
    }
    const previous = { format, identity: identityMode };
    setExporting(`${spec.identity}-${spec.format}`);
    try {
      const blob = await captureSpec(spec);
      if (onImageReady) {
        await onImageReady(spec.format, blob);
      } else {
        triggerBlobDownload(
          blob,
          `zebra-${spec.identity === 'anonymous' ? 'isimsiz' : fileBase}-${spec.format}.png`
        );
      }
    } catch (error) {
      console.error('Zebra Studio indirme hatası:', error);
      window.alert(
        `İndirme hatası: ${
          error instanceof Error ? error.message : 'Görsel oluşturulamadı'
        }`
      );
    } finally {
      flushSync(() => {
        setFormat(previous.format);
        setIdentityMode(previous.identity);
      });
      setExporting(null);
    }
  };

  const handleDownloadAll = async () => {
    if (exporting) return;
    if (!canNamedExport) {
      window.alert(
        partnership
          ? 'Paket için iki danışman seçin.'
          : 'Paket için danışman seçin.'
      );
      return;
    }
    const previous = { format, identity: identityMode };
    setExporting('all');
    try {
      const specs: ExportSpec[] = [
        { format: 'post', identity: 'named' },
        { format: 'story', identity: 'named' },
        { format: 'post', identity: 'anonymous' },
        { format: 'story', identity: 'anonymous' },
      ];
      for (const [index, spec] of specs.entries()) {
        const blob = await captureSpec(spec);
        const identity =
          spec.identity === 'anonymous' ? 'isimsiz' : fileBase;
        triggerBlobDownload(
          blob,
          `zebra-${identity}-${spec.format}.png`
        );
        // Tarayıcı birden fazla indirmeyi engellemesin diye kısa ara
        if (index < specs.length - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
      }
    } catch (error) {
      console.error('Zebra Studio paket hatası:', error);
      window.alert(
        `İndirme hatası: ${
          error instanceof Error ? error.message : 'PNG’ler oluşturulamadı'
        }`
      );
    } finally {
      flushSync(() => {
        setFormat(previous.format);
        setIdentityMode(previous.identity);
      });
      setExporting(null);
    }
  };

  const maxTranslateX =
    (canvasSize.width * (portfolioTransform.zoom - 1)) / 2;
  const maxTranslateY =
    (canvasSize.height * (portfolioTransform.zoom - 1)) / 2;
  const legalHeight = post ? 82 : 105;
  const partnerOptions = consultants.filter(
    (item) =>
      item.id !== selectedConsultantId &&
      (isManager || item.id !== userId)
  );

  return (
    <div className="panel-enter w-full">
      {!canvasPortalTarget ? (
        <div className={embedded ? 'mb-5' : 'mb-8 lg:mb-10'}>
          <p className="text-[12px] font-medium tracking-[0.16em] uppercase text-[#86868B] mb-2">
            Zebra Studio
          </p>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white">
            {embedded ? 'Post / Story Görseli Üret' : 'Yeni Portföy'}
          </h1>
        </div>
      ) : null}

      <div
        className={
          canvasPortalTarget
            ? 'flex flex-col'
            : 'flex flex-col lg:grid lg:grid-cols-2 lg:gap-10 xl:gap-14 lg:items-start'
        }
      >
        <MaybePortal target={canvasPortalTarget}>
        <div
          className={
            canvasPortalTarget
              ? 'w-full'
              : 'order-2 lg:order-2 relative z-10 lg:sticky lg:top-4 w-full max-w-md mx-auto lg:max-w-none lg:mx-0 mt-6 lg:mt-0 pb-[max(5rem,env(safe-area-inset-bottom))] lg:pb-0'
          }
        >
          <div
            className={
              canvasChromeless
                ? 'w-full'
                : 'rounded-2xl border border-white/[0.08] bg-[#121212]/90 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.35)] p-4 sm:p-5'
            }
          >
            {!canvasChromeless ? (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <span className="text-[12px] font-medium tracking-wide text-[#AEAEB2] uppercase">
                Canlı Tuval
              </span>
              <div className="flex flex-wrap gap-2">
                {!namedOnly ? (
                <div className="inline-flex rounded-full bg-black/40 border border-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setFormat('post')}
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium cursor-pointer ${
                      format === 'post'
                        ? 'bg-white text-black'
                        : 'text-[#86868B] hover:text-white'
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" />
                    Post
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('story')}
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium cursor-pointer ${
                      format === 'story'
                        ? 'bg-white text-black'
                        : 'text-[#86868B] hover:text-white'
                    }`}
                  >
                    <RectangleVertical className="w-3.5 h-3.5" />
                    Story
                  </button>
                </div>
                ) : null}
                <div className="inline-flex rounded-full bg-black/40 border border-white/10 p-1">
                  <button
                    type="button"
                    onClick={() => setIdentityMode('named')}
                    className={`h-9 px-3 rounded-full text-[12px] font-medium cursor-pointer ${
                      identityMode === 'named'
                        ? 'bg-white text-black'
                        : 'text-[#86868B] hover:text-white'
                    }`}
                  >
                    İsimli
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdentityMode('anonymous')}
                    className={`h-9 px-3 rounded-full text-[12px] font-medium cursor-pointer ${
                      identityMode === 'anonymous'
                        ? 'bg-white text-black'
                        : 'text-[#86868B] hover:text-white'
                    }`}
                  >
                    İsimsiz
                  </button>
                </div>
              </div>
            </div>
            ) : null}

            <PortalWhen active={fullscreenPreview}>
            <div
              className={
                fullscreenPreview
                  ? 'fixed inset-0 z-[120] bg-black/92 backdrop-blur-md flex flex-col'
                  : undefined
              }
              data-fullscreen-preview={fullscreenPreview || undefined}
              onMouseDown={
                fullscreenPreview
                  ? (event) => {
                      if (
                        previewFrameRef.current?.contains(
                          event.target as Node
                        )
                      ) {
                        return;
                      }
                      setFullscreenPreview(false);
                    }
                  : undefined
              }
            >
              {fullscreenPreview ? (
                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                  <div>
                    <p className="text-[13px] font-medium text-white">
                      Tam ekran önizleme
                    </p>
                    <p className="text-[12px] text-[#86868B] mt-0.5">
                      {format === 'post' ? 'Post' : 'Story'} ·{' '}
                      {canvasSize.width}×{canvasSize.height}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFullscreenPreview(false)}
                    className="w-10 h-10 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center cursor-pointer"
                    aria-label="Kapat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : null}

              <div
                ref={previewAreaRef}
                className={
                  fullscreenPreview
                    ? 'flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8'
                    : 'w-full flex items-center justify-center'
                }
              >
                <div
                  ref={previewFrameRef}
                  className="relative overflow-hidden rounded-xl bg-[#0A0A0A] border border-white/5"
                  style={{
                    height: canvasSize.height * previewScale,
                    width: canvasSize.width * previewScale,
                  }}
                >
                  {!fullscreenPreview ? (
                    <button
                      type="button"
                      onClick={() => setFullscreenPreview(true)}
                      className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/55 border border-white/15 text-white inline-flex items-center justify-center cursor-pointer hover:bg-black/75 backdrop-blur-sm"
                      aria-label="Tam ekran izle"
                      title="Tam ekran izle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  ) : null}
              <div
                ref={canvasRef}
                className="absolute top-0 left-0 overflow-hidden text-white select-none"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  fontFamily:
                    'var(--font-montserrat), var(--font-geist-sans), sans-serif',
                }}
              >
                <div
                  className={`absolute inset-0 z-0 bg-[#263648] ${
                    portfolioPreview ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                  style={{ touchAction: 'none' }}
                  onPointerDown={onPortfolioPointerDown}
                  onPointerMove={onPortfolioPointerMove}
                  onPointerUp={stopPortfolioDrag}
                  onPointerCancel={stopPortfolioDrag}
                >
                  {portfolioPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portfolioPreview}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{
                        transform: `translate(${
                          portfolioTransform.x * maxTranslateX
                        }px, ${
                          portfolioTransform.y * maxTranslateY
                        }px) scale(${portfolioTransform.zoom})`,
                        transformOrigin: 'center',
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/30">
                      <ImagePlus className="w-20 h-20" strokeWidth={1} />
                      <span className="text-[28px]">Portföy görseli</span>
                    </div>
                  )}
                </div>

                <div
                  className="absolute inset-0 z-[1] pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(to bottom, rgba(8,20,35,.38) 0%, rgba(8,20,35,0) 35%, rgba(3,12,24,.05) 50%, rgba(2,10,20,.82) 100%)',
                  }}
                />

                <div
                  className="absolute z-[3] pointer-events-none"
                  style={
                    post
                      ? { top: 58, right: 52, width: 272 }
                      : {
                          top: 42,
                          left: '50%',
                          width: 330,
                          transform: 'translateX(-50%)',
                        }
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={FIXED_ASSETS.logo}
                    alt=""
                    className="w-full h-auto object-contain"
                    draggable={false}
                  />
                </div>

                <div
                  className="absolute z-[3] pointer-events-none"
                  style={{
                    top: post ? 66 : 300,
                    left: post ? 55 : 50,
                    maxWidth: post ? 650 : 720,
                    textShadow:
                      '0 3px 3px rgba(0,0,0,.9), 0 0 10px rgba(0,0,0,.7)',
                  }}
                >
                  {subheadline.trim() ? (
                    <p
                      className="text-white font-bold leading-none tracking-[0.02em]"
                      style={{
                        fontSize: post ? 22 : 25,
                        fontFamily: 'var(--font-zalando-expanded)',
                        fontWeight: 600,
                      }}
                    >
                      {toTurkishUpper(subheadline.trim())}
                    </p>
                  ) : null}
                  {headline.trim() ? (
                    <h2
                      className="text-white font-extrabold leading-[1.02] mt-3 tracking-[-0.035em]"
                      style={{
                        fontSize: post ? 92 : 102,
                        fontFamily: 'var(--font-oswald), sans-serif',
                        fontWeight: 700,
                      }}
                    >
                      {headline.trim().normalize('NFC')}
                    </h2>
                  ) : null}
                </div>

                {description.trim() ? (
                  <p
                    className="absolute z-[3] text-right text-white font-extrabold whitespace-pre-line leading-[1.18] pointer-events-none"
                    style={{
                      top: post ? 350 : 565,
                      right: post ? 48 : 46,
                      maxWidth: 280,
                      fontSize: post ? 34 : 38,
                      fontFamily: 'var(--font-oswald), sans-serif',
                      fontWeight: 700,
                      textShadow:
                        '0 3px 2px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,.8)',
                    }}
                  >
                    {description.trim().normalize('NFC')}
                  </p>
                ) : null}

                {identityMode === 'named' && profile.name ? (
                  <>
                    <IdentityLayer
                      format={format}
                      partnership={partnership}
                      profile={profile}
                      photoSrc={consultantSrc}
                      side="left"
                      failed={brokenPhoto === consultantSrc}
                      onError={() => setBrokenPhoto(consultantSrc || '')}
                    />
                    {partnership && partner.name ? (
                      <IdentityLayer
                        format={format}
                        partnership
                        profile={partner}
                        photoSrc={partnerSrc}
                        side="right"
                        failed={brokenPartnerPhoto === partnerSrc}
                        onError={() =>
                          setBrokenPartnerPhoto(partnerSrc || '')
                        }
                      />
                    ) : null}
                  </>
                ) : null}

                <div
                  className="absolute inset-x-0 bottom-0 z-[8] border-t border-white/70 pointer-events-none"
                  style={{
                    height: legalHeight,
                    background: 'rgba(4,14,28,.62)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={FIXED_ASSETS.legal}
                    alt=""
                    className="absolute object-contain object-left"
                    style={{
                      left: post ? 55 : 50,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '35%',
                      height: 'auto',
                    }}
                    draggable={false}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={FIXED_ASSETS.motto}
                    alt=""
                    className="absolute object-contain object-right"
                    style={{
                      right: post ? 58 : 52,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: post ? 385 : 420,
                      height: post ? 50 : 56,
                    }}
                    draggable={false}
                  />
                </div>
              </div>

              {canvasOverlay ? (
                <div className="pointer-events-none absolute inset-0 z-[9]">
                  {canvasOverlay}
                </div>
              ) : null}
                </div>
              </div>
            </div>
            </PortalWhen>

            {portfolioPreview ? (
              <div className="mt-3 flex items-center gap-3">
                <Move className="w-4 h-4 text-[#636366] shrink-0" />
                <input
                  type="range"
                  min="1"
                  max="1.8"
                  step="0.01"
                  value={portfolioTransform.zoom}
                  onChange={(event) =>
                    setPortfolioTransform((current) => ({
                      ...current,
                      zoom: Number(event.target.value),
                      x: Number(event.target.value) === 1 ? 0 : current.x,
                      y: Number(event.target.value) === 1 ? 0 : current.y,
                    }))
                  }
                  className="flex-1 accent-white"
                  aria-label="Portföy görseli yakınlaştırma"
                />
                <span className="w-11 text-right text-[11px] text-[#86868B] tabular-nums">
                  %{Math.round(portfolioTransform.zoom * 100)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPortfolioTransform({ x: 0, y: 0, zoom: 1.15 })
                  }
                  className="w-9 h-9 rounded-full border border-white/10 text-[#86868B] hover:text-white inline-flex items-center justify-center cursor-pointer"
                  aria-label="Görsel konumunu sıfırla"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : null}

            {!embedded ? (
              <button
                type="button"
                onClick={() => void handleDownloadAll()}
                disabled={Boolean(exporting) || !canNamedExport}
                className="mt-4 w-full h-12 inline-flex items-center justify-center gap-2 rounded-full bg-white text-black text-[14px] font-medium hover:bg-neutral-100 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting === 'all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {exporting === 'all'
                  ? '4 PNG hazırlanıyor…'
                  : '4 PNG indir (isimli + isimsiz)'}
              </button>
            ) : null}

            {!canvasChromeless ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  { format: 'post', identity: 'named', label: 'İsimli Post' },
                  { format: 'story', identity: 'named', label: 'İsimli Story' },
                  {
                    format: 'post',
                    identity: 'anonymous',
                    label: 'İsimsiz Post',
                  },
                  {
                    format: 'story',
                    identity: 'anonymous',
                    label: 'İsimsiz Story',
                  },
                ] as const
              )
                .filter((spec) => !namedOnly || spec.identity === 'named')
                .map((spec) => {
                const key = `${spec.identity}-${spec.format}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void handleSingleDownload(spec)}
                    disabled={
                      Boolean(exporting) ||
                      (spec.identity === 'named' && !canNamedExport)
                    }
                    className="h-10 rounded-xl border border-white/10 text-[12px] text-[#AEAEB2] hover:text-white hover:border-white/25 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    {exporting === key ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {embedded ? `${spec.label} kullan` : spec.label}
                  </button>
                );
              })}
            </div>
            ) : null}
          </div>
        </div>
        </MaybePortal>

        <div className="order-1 lg:order-1 space-y-5 sm:space-y-6">
          <section className="rounded-2xl border border-white/5 bg-[#161616]/80 backdrop-blur-xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-[15px] font-medium text-white">
                Portföy görseli
              </h2>
            </div>
            {portfolioPreview ? (
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portfolioPreview}
                  alt="Portföy önizleme"
                  className="w-full h-40 object-cover"
                />
                <button
                  type="button"
                  onClick={() => onPortfolioFile(null)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center cursor-pointer"
                  aria-label="Fotoğrafı kaldır"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-3 min-h-[150px] rounded-xl border border-dashed border-white/15 bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/25 cursor-pointer px-4 py-8">
                <ImagePlus className="w-7 h-7 text-[#86868B]" />
                <span className="text-[14px] font-medium text-white">
                  Fotoğraf seç
                </span>
                <span className="text-[12px] text-[#636366]">
                  JPG, PNG · yüksek çözünürlük önerilir
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) =>
                    onPortfolioFile(event.target.files?.[0] || null)
                  }
                />
              </label>
            )}
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#161616]/80 backdrop-blur-xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-[15px] font-medium text-white">
                İlan metinleri
              </h2>
            </div>
            <label className="block space-y-2">
              <span className="text-[12px] font-medium tracking-wide text-[#AEAEB2] uppercase">
                Konum
              </span>
              <input
                value={subheadline}
                onChange={(event) => setSubheadline(event.target.value)}
                placeholder="TORBALI, MURATBEY MAH."
                className="w-full h-12 rounded-xl bg-[#0A0A0A] border border-white/10 focus:border-white/25 text-white placeholder:text-[#636366] px-4 outline-none"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[12px] font-medium tracking-wide text-[#AEAEB2] uppercase">
                İlan başlığı
              </span>
              <input
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                placeholder="Satılık Daire"
                className="w-full h-12 rounded-xl bg-[#0A0A0A] border border-white/10 focus:border-white/25 text-white placeholder:text-[#636366] px-4 outline-none"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[12px] font-medium tracking-wide text-[#AEAEB2] uppercase">
                İlan özellikleri
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={'2+1\nAra kat\nYeni Bina'}
                rows={4}
                className="w-full rounded-xl bg-[#0A0A0A] border border-white/10 focus:border-white/25 text-white placeholder:text-[#636366] px-4 py-3 outline-none resize-none leading-relaxed"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-white/5 bg-[#161616]/80 backdrop-blur-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-medium text-white">
                  Danışman ve ortaklık
                </h2>
              </div>
              {profileLoading ? (
                <Loader2 className="w-4 h-4 text-[#636366] animate-spin" />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPartnership(false);
                  setSelectedPartnerId('');
                  setPartner(EMPTY_PROFILE);
                }}
                className={`h-11 rounded-xl border text-[13px] inline-flex items-center justify-center gap-2 cursor-pointer ${
                  !partnership
                    ? 'bg-white text-black border-white'
                    : 'border-white/10 text-[#AEAEB2]'
                }`}
              >
                <User className="w-4 h-4" />
                Tek danışman
              </button>
              <button
                type="button"
                onClick={() => setPartnership(true)}
                className={`h-11 rounded-xl border text-[13px] inline-flex items-center justify-center gap-2 cursor-pointer ${
                  partnership
                    ? 'bg-white text-black border-white'
                    : 'border-white/10 text-[#AEAEB2]'
                }`}
              >
                <Users className="w-4 h-4" />
                Ortak
              </button>
            </div>

            {isManager ? (
              <div className="space-y-2">
                <span className="text-[12px] text-[#AEAEB2]">
                  Birinci danışman
                </span>
                <div className="relative">
                  <select
                    value={selectedConsultantId}
                    onChange={(event) =>
                      selectProfile(event.target.value, 'primary')
                    }
                    className="w-full appearance-none h-12 rounded-xl bg-[#0A0A0A] border border-white/10 text-white px-4 pr-11 outline-none cursor-pointer"
                  >
                    <option value="">Danışman seçin</option>
                    {consultants.map((consultant) => (
                      <option key={consultant.id} value={consultant.id}>
                        {consultant.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-black/25 border border-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-[#636366]">
                  Birinci danışman
                </p>
                <p className="text-[14px] text-white mt-1">
                  {profile.name || 'Profil yükleniyor…'}
                </p>
              </div>
            )}

            {partnership ? (
              <div className="space-y-2">
                <span className="text-[12px] text-[#AEAEB2]">
                  İkinci danışman
                </span>
                <div className="relative">
                  <select
                    value={selectedPartnerId}
                    onChange={(event) =>
                      selectProfile(event.target.value, 'partner')
                    }
                    className="w-full appearance-none h-12 rounded-xl bg-[#0A0A0A] border border-white/10 text-white px-4 pr-11 outline-none cursor-pointer"
                  >
                    <option value="">Ortak seçin</option>
                    {partnerOptions.map((consultant) => (
                      <option key={consultant.id} value={consultant.id}>
                        {consultant.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868B]" />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[profile, ...(partnership ? [partner] : [])].map(
                (item, index) => (
                  <div
                    key={`${index}-${item.rawName}`}
                    className="rounded-xl bg-black/25 border border-white/5 px-4 py-3 min-w-0"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-[#636366]">
                      {index === 0 ? 'Danışman' : 'Ortak'}
                    </p>
                    <p className="text-[14px] font-medium text-white mt-1 truncate">
                      {item.name || 'Seçilmedi'}
                    </p>
                    <p className="text-[12px] text-[#86868B] mt-1 truncate">
                      {item.name ? item.title : '—'}
                    </p>
                    <p className="text-[12px] text-[#AEAEB2] mt-1 tabular-nums">
                      {item.phone || '—'}
                    </p>
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}