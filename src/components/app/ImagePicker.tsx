"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Field, Icon, Modal, cx } from "@/components/ui";
import { APP_IMAGE_PRESETS } from "@/lib/format";

export async function compressImageFile(file: File, maxDim = 920, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem válido (JPG, PNG ou WebP).");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Formato de imagem não suportado pelo navegador."));
    element.src = dataUrl;
  });

  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 600;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#1f1630";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function ImagePickerField({
  label,
  value,
  onChange,
  hint,
  aspect = "wide",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  aspect?: "wide" | "square";
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    setErr(null);
    try {
      const compressed = await compressImageFile(file);
      onChange(compressed);
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const isDataUrl = value.startsWith("data:image/");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
          >
            <Icon name="camera" size={13} /> {loading ? "Processando..." : "Enviar foto do aparelho"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUrl((v) => !v)}>
            URL
          </button>
          {value ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")} title="Remover imagem">
              <Icon name="x" size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {err ? <p className="text-xs text-rose-500">{err}</p> : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div
          className={cx(
            "relative shrink-0 overflow-hidden rounded-xl border",
            aspect === "square" ? "h-20 w-20" : "h-24 w-full sm:w-40",
          )}
          style={{ borderColor: "var(--border)", background: "var(--raised)" }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="muted flex h-full w-full flex-col items-center justify-center gap-1 text-[0.65rem]">
              <Icon name="image" size={18} />
              Sem imagem
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="muted mb-1 text-[0.68rem]">Ou escolha uma imagem da galeria do app:</p>
          <div className="grid grid-cols-5 gap-1.5">
            {APP_IMAGE_PRESETS.map((preset) => (
              <button
                key={preset.src}
                type="button"
                onClick={() => onChange(preset.src)}
                className="overflow-hidden rounded-lg border-2 text-center transition"
                style={{ borderColor: value === preset.src ? "var(--primary)" : "var(--border)" }}
                title={preset.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preset.src} alt={preset.label} className="h-11 w-full object-cover" />
                <span className="muted block truncate px-0.5 py-0.5 text-[0.55rem]">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showUrl ? (
        <Field label="Link da imagem (URL)" hint={isDataUrl ? "Atualmente usando foto enviada do seu aparelho." : undefined}>
          <input
            className="input text-xs"
            value={isDataUrl ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... ou /images/tarot-hero.jpg"
          />
        </Field>
      ) : null}

      {hint ? <p className="muted text-[0.68rem] leading-snug">{hint}</p> : null}
    </div>
  );
}

export function QuickAppImageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const [profileImage, setProfileImage] = useState(data.settings.profileImage);
  const [coverImage, setCoverImage] = useState(data.settings.coverImage || data.settings.profileImage);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfileImage(data.settings.profileImage);
    setCoverImage(data.settings.coverImage || data.settings.profileImage);
  }, [open, data.settings.profileImage, data.settings.coverImage]);

  const save = async () => {
    setSaving(true);
    try {
      await mutate("/api/settings", "PATCH", {
        profileImage,
        coverImage: coverImage || profileImage,
      });
      toast("Imagens do aplicativo atualizadas.", "success");
      onClose();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Personalizar imagens do aplicativo"
      subtitle="Envie fotos do seu telefone, tablet ou computador, ou escolha na galeria mística."
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : "Salvar imagens"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ImagePickerField
          label="Imagem de capa do painel inicial"
          value={coverImage}
          onChange={setCoverImage}
          aspect="wide"
          hint="Aparece no topo do Painel inicial no celular, tablet e computador."
        />
        <div className="divider" />
        <ImagePickerField
          label="Foto ou logo da cartomante (perfil)"
          value={profileImage}
          onChange={setProfileImage}
          aspect="square"
          hint="Aparece ao lado do seu nome profissional no menu do aplicativo."
        />
      </div>
    </Modal>
  );
}
