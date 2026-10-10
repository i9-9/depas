export function Photo({
  src,
  alt,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        className={`flex items-center justify-center bg-photo text-[10px] uppercase tracking-[0.08em] text-muted ${className}`}
      >
        sin foto
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`block bg-photo object-cover ${className}`}
      referrerPolicy="no-referrer"
      decoding={priority ? "sync" : "async"}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
    />
  );
}
