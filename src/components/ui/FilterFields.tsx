import { ButtonSelect } from "@/components/ui/ButtonSelect";

export function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-[140px] flex-1 ${className}`.trim()}>
      <label className="block text-xs font-medium text-zinc-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = "",
  optionsClassName = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  optionsClassName?: string;
}) {
  return (
    <ButtonSelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      size="sm"
      className={className}
      optionsClassName={optionsClassName}
    />
  );
}
