"use client";

import { Field } from "@/components/ui";
import { CLIENT_ORIGIN_OPTIONS } from "@/lib/client-origins";
import type { ClientOrigin } from "@/lib/types";

export function ClientOriginField({
  value,
  onChange,
  className,
}: {
  value: ClientOrigin;
  onChange: (value: ClientOrigin) => void;
  className?: string;
}) {
  return (
    <Field label="Como a consulente conheceu seu trabalho?" hint="Opcional. Você pode alterar essa informação depois." className={className}>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value as ClientOrigin)}>
        {CLIENT_ORIGIN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
