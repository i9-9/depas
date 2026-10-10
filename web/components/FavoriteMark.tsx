export function StarIcon({
  on,
  size = 28,
}: {
  on: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className="block"
    >
      <path
        d="M12 2.2 14.7 8l6.5.9-4.8 4.5 1.2 6.4L12 16.8 6.4 19.8l1.2-6.4L2.8 8.9 9.3 8 12 2.2z"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function FavoriteButton({
  on,
  onClick,
  disabled,
  size = "md",
  labelOn = "Sacar de guardados",
  labelOff = "Guardar para después",
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  labelOn?: string;
  labelOff?: string;
}) {
  const box = size === "lg" ? "size-16" : size === "sm" ? "size-11" : "size-14";
  const star = size === "lg" ? 36 : size === "sm" ? 22 : 30;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? labelOn : labelOff}
      disabled={disabled}
      onClick={onClick}
      className={`grid ${box} place-items-center ${on ? "text-title" : "text-ink"}`}
    >
      <StarIcon on={on} size={star} />
    </button>
  );
}
