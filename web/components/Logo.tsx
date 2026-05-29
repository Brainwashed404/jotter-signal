export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-label="Jotter Intelligence" role="img">
      <circle cx="256" cy="256" r="208" fill="#8acbb0" />
      <circle cx="256" cy="256" r="176" fill="#e3bb4e" />
      <circle cx="256" cy="256" r="96" fill="#0d0d0d" />
    </svg>
  );
}
